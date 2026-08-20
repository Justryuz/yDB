/**
 * @file middleware/masking.js
 * @description Server-side data masking — masks sensitive columns in query results
 * BEFORE sending to client, based on user role and column rules.
 *
 * Sensitive patterns: password, hash, token, secret, ssn, credit_card
 * Partial masking: email fields
 *
 * Admin role: no masking applied
 * Editor role: partial masking (emails show first 2 chars)
 * Viewer role: full masking on all sensitive fields
 */

const sensitivePatterns = ['password', 'pass', 'secret', 'token', 'key', 'hash', 'ssn', 'credit_card', 'card_number'];
const emailPatterns = ['email', 'e_mail'];

/**
 * Determine if a column should be masked.
 * @param {string} colName
 * @returns {'full'|'partial'|null}
 */
function getMaskType(colName) {
    const lower = colName.toLowerCase();
    if (sensitivePatterns.some(p => lower.includes(p))) return 'full';
    if (emailPatterns.some(p => lower.includes(p))) return 'partial';
    return null;
}

/**
 * Apply masking to a single value.
 * @param {*} value
 * @param {'full'|'partial'} type
 * @returns {string}
 */
function maskValue(value, type) {
    if (value == null) return value;
    const str = String(value);

    if (type === 'full') return '••••••••';
    if (type === 'partial') {
        // Email: show first 2 chars + mask + @domain
        if (str.includes('@')) {
            const [local, domain] = str.split('@');
            return local.substring(0, 2) + '•••@' + domain;
        }
        return str.length > 4 ? str[0] + '•••' + str[str.length - 1] : '••••';
    }
    return value;
}

/**
 * Apply masking to query result based on user role.
 * @param {Object} result - { columns, data }
 * @param {string} role - User role (admin/editor/viewer)
 * @returns {Object} - Masked result
 */
function applyMasking(result, role) {
    // Admin sees everything unmasked
    if (role === 'admin') return result;
    if (!result || !result.columns || !result.data) return result;

    // Determine which columns need masking
    const maskMap = {};
    result.columns.forEach(col => {
        const type = getMaskType(col);
        if (type) {
            // Viewer gets full masking, editor gets partial for emails
            if (role === 'viewer') maskMap[col] = 'full';
            else if (role === 'editor' && type === 'partial') maskMap[col] = 'partial';
            else if (type === 'full') maskMap[col] = 'full';
        }
    });

    // No masking needed
    if (Object.keys(maskMap).length === 0) return result;

    // Apply masking to each row
    const maskedData = result.data.map(row => {
        const newRow = { ...row };
        Object.entries(maskMap).forEach(([col, type]) => {
            if (col in newRow) newRow[col] = maskValue(newRow[col], type);
        });
        return newRow;
    });

    return { ...result, data: maskedData };
}

module.exports = { applyMasking, getMaskType, maskValue };
