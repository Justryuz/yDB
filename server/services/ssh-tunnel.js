/**
 * @file services/ssh-tunnel.js
 * @description SSH tunnel service — creates port-forwarded connections through SSH.
 * Uses the ssh2 package to establish tunnels before connecting to remote databases.
 */

const { Client } = require('ssh2');
const net = require('net');

/**
 * Active tunnels cache: { tunnelId: { server, sshConn, localPort } }
 */
const activeTunnels = {};

/**
 * Create an SSH tunnel and return the local port to connect through.
 *
 * @param {Object} sshOpts - SSH connection options
 * @param {string} sshOpts.host - SSH server host
 * @param {number} sshOpts.port - SSH server port (default 22)
 * @param {string} sshOpts.username - SSH username
 * @param {string} sshOpts.authMethod - 'password' or 'key'
 * @param {string} [sshOpts.password] - SSH password (if authMethod is 'password')
 * @param {string} [sshOpts.privateKey] - Private key content (if authMethod is 'key')
 * @param {string} dbHost - Remote database host (as seen from SSH server)
 * @param {number} dbPort - Remote database port
 * @returns {Promise<{localPort: number, close: Function}>}
 */
function createTunnel(sshOpts, dbHost, dbPort) {
    return new Promise((resolve, reject) => {
        const sshConn = new Client();
        const tunnelId = `${sshOpts.host}:${sshOpts.port}->${dbHost}:${dbPort}`;

        // Check if tunnel already exists
        if (activeTunnels[tunnelId]) {
            return resolve({
                localPort: activeTunnels[tunnelId].localPort,
                close: () => closeTunnel(tunnelId)
            });
        }

        // Create local TCP server that forwards to remote DB through SSH
        const server = net.createServer((localSocket) => {
            sshConn.forwardOut(
                '127.0.0.1', localSocket.localPort,
                dbHost, dbPort,
                (err, stream) => {
                    if (err) { localSocket.end(); return; }
                    localSocket.pipe(stream).pipe(localSocket);
                }
            );
        });

        // Listen on random available port
        server.listen(0, '127.0.0.1', () => {
            const localPort = server.address().port;
            activeTunnels[tunnelId] = { server, sshConn, localPort };

            console.log(`[SSH] Tunnel established: localhost:${localPort} -> ${sshOpts.host}:${sshOpts.port} -> ${dbHost}:${dbPort}`);

            resolve({
                localPort,
                close: () => closeTunnel(tunnelId)
            });
        });

        server.on('error', (err) => {
            reject(new Error('SSH tunnel server error: ' + err.message));
        });

        // SSH connection config
        const sshConfig = {
            host: sshOpts.host,
            port: sshOpts.port || 22,
            username: sshOpts.username,
            readyTimeout: 10000
        };

        if (sshOpts.authMethod === 'key' && sshOpts.privateKey) {
            sshConfig.privateKey = sshOpts.privateKey;
        } else {
            sshConfig.password = sshOpts.password;
        }

        sshConn.on('ready', () => {
            // SSH connected — server is already listening
        });

        sshConn.on('error', (err) => {
            server.close();
            reject(new Error('SSH connection failed: ' + err.message));
        });

        sshConn.on('close', () => {
            closeTunnel(tunnelId);
        });

        sshConn.connect(sshConfig);
    });
}

/**
 * Close an active tunnel.
 * @param {string} tunnelId
 */
function closeTunnel(tunnelId) {
    const tunnel = activeTunnels[tunnelId];
    if (!tunnel) return;

    try { tunnel.server.close(); } catch (e) {}
    try { tunnel.sshConn.end(); } catch (e) {}
    delete activeTunnels[tunnelId];
    console.log(`[SSH] Tunnel closed: ${tunnelId}`);
}

/**
 * Close all active tunnels (for graceful shutdown).
 */
function closeAll() {
    Object.keys(activeTunnels).forEach(closeTunnel);
}

/**
 * Get connection opts with SSH tunnel applied.
 * If SSH is enabled, creates tunnel and returns modified opts with localhost + tunneled port.
 *
 * @param {Object} connOpts - Original connection options { host, port, user, password, database }
 * @param {Object|null} sshOpts - SSH options from connection.options.ssh
 * @returns {Promise<{opts: Object, cleanup: Function}>}
 */
async function withTunnel(connOpts, sshOpts) {
    if (!sshOpts || !sshOpts.enabled) {
        return { opts: connOpts, cleanup: () => {} };
    }

    const tunnel = await createTunnel(sshOpts, connOpts.host, connOpts.port);

    return {
        opts: {
            ...connOpts,
            host: '127.0.0.1',
            port: tunnel.localPort
        },
        cleanup: tunnel.close
    };
}

module.exports = { createTunnel, closeTunnel, closeAll, withTunnel };
