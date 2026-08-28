/**
 * @file services/data-quality.js
 * @description AI Data Quality Scanner — analyzes table data for issues.
 *
 * Detects:
 *  - NULL values (% per column)
 *  - Empty strings
 *  - Leading/trailing whitespace
 *  - Date format inconsistencies
 *  - Duplicate rows
 *  - Numeric columns with non-numeric values
 *  - Outliers (values far from mean)
 *
 * Generates:
 *  - Quality score per table (0-100)
 *  - Issue report per column
 *  - Suggested fix SQL statements
 */

/**
 * Scan a table's data quality.
 * @param {Array} data - Sample rows from the table
 * @param {Array} columns - Column definitions [{name, type}]
 * @param {string} tableName - Table name
 * @param {string} dbType - mysql/postgresql
 * @returns {Object} Quality report
 */
function scanTable(data, columns, tableName, dbType) {
    const isMySQL = dbType === 'mysql' || dbType === 'mariadb';
    const colNames = columns.map(c => c.name || c);
    const totalRows = data.length;

    if (totalRows === 0) {
        return { tableName, totalRows: 0, score: 100, issues: [], fixes: [], summary: 'Table is empty — no data to analyze.' };
    }

    const issues = [];
    const fixes = [];
    let totalIssuePoints = 0;

    for (const col of colNames) {
        const values = data.map(r => r[col]);
        const colIssues = analyzeColumn(col, values, tableName, isMySQL);

        if (colIssues.length > 0) {
            issues.push(...colIssues);
            totalIssuePoints += colIssues.reduce((sum, i) => sum + i.severity, 0);

            // Generate fix SQL for each issue
            for (const issue of colIssues) {
                if (issue.fix) fixes.push(issue.fix);
            }
        }
    }

    // Check for duplicate rows
    const duplicateCheck = detectDuplicates(data, colNames, tableName);
    if (duplicateCheck) {
        issues.push(duplicateCheck);
        totalIssuePoints += duplicateCheck.severity;
    }

    // Calculate score (100 = perfect, 0 = terrible)
    const maxPoints = colNames.length * 10 + 10; // max possible issues
    const score = Math.max(0, Math.round(100 - (totalIssuePoints / maxPoints) * 100));

    // Generate summary
    const summary = generateSummary(issues, score, totalRows, colNames.length);

    return { tableName, totalRows, columnCount: colNames.length, score, issues, fixes, summary };
}

/**
 * Analyze a single column for data quality issues.
 */
function analyzeColumn(colName, values, tableName, isMySQL) {
    const issues = [];
    const total = values.length;
    if (total === 0) return issues;

    // 1. NULL count
    const nullCount = values.filter(v => v === null || v === undefined).length;
    const nullPct = Math.round((nullCount / total) * 100);
    if (nullPct > 0) {
        issues.push({
            column: colName,
            type: 'null_values',
            severity: nullPct > 50 ? 3 : nullPct > 20 ? 2 : 1,
            message: `${nullPct}% NULL values (${nullCount}/${total} rows)`,
            fix: nullPct > 80 ? null : undefined // Don't suggest fix if mostly NULL (might be intentional)
        });
    }

    // 2. Empty strings
    const emptyCount = values.filter(v => v === '').length;
    const emptyPct = Math.round((emptyCount / total) * 100);
    if (emptyPct > 0) {
        issues.push({
            column: colName,
            type: 'empty_strings',
            severity: emptyPct > 30 ? 2 : 1,
            message: `${emptyPct}% empty strings (${emptyCount} rows) — consider converting to NULL`,
            fix: `UPDATE ${tableName} SET ${colName} = NULL WHERE ${colName} = '';`
        });
    }

    // 3. Whitespace (leading/trailing)
    const nonNullStrings = values.filter(v => typeof v === 'string' && v.length > 0);
    const whitespaceCount = nonNullStrings.filter(v => v !== v.trim()).length;
    if (whitespaceCount > 0) {
        const wspPct = Math.round((whitespaceCount / Math.max(nonNullStrings.length, 1)) * 100);
        issues.push({
            column: colName,
            type: 'whitespace',
            severity: 2,
            message: `${wspPct}% values have leading/trailing whitespace (${whitespaceCount} rows)`,
            fix: isMySQL
                ? `UPDATE ${tableName} SET ${colName} = TRIM(${colName}) WHERE ${colName} != TRIM(${colName});`
                : `UPDATE ${tableName} SET ${colName} = TRIM(${colName}) WHERE ${colName} != TRIM(${colName});`
        });
    }

    // 4. Date format issues
    if (/date|time|created|updated|registered|born|expired/i.test(colName)) {
        const dateValues = nonNullStrings.filter(v => v.length > 0);
        const formats = new Set();
        for (const v of dateValues.slice(0, 50)) {
            if (/^\d{4}-\d{2}-\d{2}/.test(v)) formats.add('ISO');
            else if (/^\d{2}\/\d{2}\/\d{4}/.test(v)) formats.add('DD/MM/YYYY');
            else if (/^\d{2}-\d{2}-\d{4}/.test(v)) formats.add('DD-MM-YYYY');
            else if (/^\d+$/.test(v)) formats.add('UNIX');
            else if (v === '0000-00-00' || v === '0000-00-00 00:00:00') formats.add('ZERO_DATE');
            else formats.add('OTHER');
        }
        if (formats.size > 1) {
            issues.push({
                column: colName,
                type: 'date_format_inconsistent',
                severity: 3,
                message: `Mixed date formats detected: ${[...formats].join(', ')}`,
                fix: null
            });
        }
        if (formats.has('ZERO_DATE')) {
            const zeroCount = dateValues.filter(v => v === '0000-00-00' || v === '0000-00-00 00:00:00').length;
            issues.push({
                column: colName,
                type: 'zero_dates',
                severity: 2,
                message: `${zeroCount} zero-date values (0000-00-00)`,
                fix: `UPDATE ${tableName} SET ${colName} = NULL WHERE ${colName} = '0000-00-00' OR ${colName} = '0000-00-00 00:00:00';`
            });
        }
    }

    // 5. Numeric column with non-numeric values
    if (/amount|total|price|cost|fee|qty|quantity|count|balance|rate|age|score/i.test(colName)) {
        const nonNullVals = values.filter(v => v !== null && v !== undefined && v !== '');
        const nonNumeric = nonNullVals.filter(v => typeof v === 'string' && isNaN(parseFloat(v)));
        if (nonNumeric.length > 0) {
            issues.push({
                column: colName,
                type: 'non_numeric',
                severity: 3,
                message: `${nonNumeric.length} non-numeric values in numeric column`,
                fix: null
            });
        }

        // Outlier detection (values > 3 standard deviations from mean)
        const nums = nonNullVals.map(v => parseFloat(v)).filter(v => !isNaN(v));
        if (nums.length > 10) {
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            const stdDev = Math.sqrt(nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / nums.length);
            if (stdDev > 0) {
                const outliers = nums.filter(v => Math.abs(v - mean) > 3 * stdDev);
                if (outliers.length > 0) {
                    issues.push({
                        column: colName,
                        type: 'outliers',
                        severity: 1,
                        message: `${outliers.length} potential outlier(s) detected (>3 std dev from mean ${mean.toFixed(2)})`,
                        fix: null
                    });
                }
            }
        }
    }

    return issues;
}

/**
 * Detect duplicate rows.
 */
function detectDuplicates(data, colNames, tableName) {
    if (data.length < 2) return null;

    const seen = new Set();
    let dupeCount = 0;
    for (const row of data) {
        const key = colNames.map(c => String(row[c] || '')).join('|');
        if (seen.has(key)) dupeCount++;
        else seen.add(key);
    }

    if (dupeCount > 0) {
        return {
            column: '*',
            type: 'duplicates',
            severity: 3,
            message: `${dupeCount} duplicate row(s) detected in sample`,
            fix: null
        };
    }
    return null;
}

/**
 * Generate human-readable summary.
 */
function generateSummary(issues, score, totalRows, colCount) {
    if (issues.length === 0) return `Excellent! No data quality issues found in ${totalRows} rows across ${colCount} columns.`;

    const critical = issues.filter(i => i.severity >= 3).length;
    const warnings = issues.filter(i => i.severity === 2).length;
    const info = issues.filter(i => i.severity === 1).length;

    let summary = `Quality Score: ${score}/100. `;
    summary += `Found ${issues.length} issue(s): `;
    if (critical > 0) summary += `${critical} critical, `;
    if (warnings > 0) summary += `${warnings} warning(s), `;
    if (info > 0) summary += `${info} info. `;
    summary += `Analyzed ${totalRows} rows across ${colCount} columns.`;
    return summary;
}

module.exports = { scanTable };
