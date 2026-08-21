/**
 * @file auth.js
 * @description Authentication module — login, logout, force-password-change.
 * Requires backend to be online. No mock/offline login fallback.
 * @module YDB.Auth
 */

YDB.Auth = {

    /**
     * Initialize auth module. Bind login form and check existing session.
     */
    init: function () {
        var self = this;

        document.getElementById('form-login').addEventListener('submit', function (e) {
            e.preventDefault();
            self.login();
        });

        document.getElementById('btn-logout').addEventListener('click', function () {
            self.logout();
        });

        // Check backend availability and existing session
        this._checkBackendAndSession();
    },

    /** @private Check if backend is reachable and validate existing token */
    _checkBackendAndSession: function () {
        var self = this;

        // First check setup status (public endpoint)
        fetch(YDB.API.baseURL + '/auth/setup-status')
            .then(function (res) {
                if (res.ok) return res.json();
                throw new Error('Backend not reachable');
            })
            .then(function (data) {
                YDB.API.online = true;

                // If we have a stored token, validate it
                if (YDB.API.token) {
                    YDB.API.get('/auth/me').then(function (user) {
                        YDB.State.user = user.username;
                        if (user.force_password_change) {
                            self._showPasswordChange();
                        } else {
                            self.showSplashThenApp();
                        }
                    }).catch(function () {
                        YDB.API.clearToken();
                        // Show login form
                    });
                }
            })
            .catch(function () {
                // Backend not available — show error on login page
                YDB.API.online = false;
                var loginErr = document.getElementById('login-error');
                if (loginErr) {
                    loginErr.textContent = 'Backend server is not available. Please ensure the server is running.';
                    loginErr.classList.remove('hidden');
                }
            });
    },

    /**
     * Login — always uses the API. No mock fallback.
     */
    login: function () {
        var self = this;
        var username = document.getElementById('input-username').value;
        var password = document.getElementById('input-password').value;

        if (!username || !password) {
            YDB.UI.toast('Enter username and password', 'warning');
            return;
        }

        YDB.API.post('/auth/login', { username: username, password: password })
            .then(function (data) {
                YDB.API.online = true;
                YDB.API.setToken(data.token);
                YDB.State.user = data.user.username;

                if (data.forcePasswordChange) {
                    self._showPasswordChange();
                } else {
                    self.showSplashThenApp();
                }
            })
            .catch(function (err) {
                if (err.status === 429) {
                    YDB.UI.toast('Too many attempts. Please wait and try again.', 'error');
                } else if (err.status === 401 || err.status === 403) {
                    YDB.UI.toast(err.message || 'Invalid credentials', 'error');
                } else {
                    YDB.UI.toast('Server unavailable: ' + (err.message || 'Connection failed'), 'error');
                }
            });
    },

    /** @private Show forced password change dialog */
    _showPasswordChange: function () {
        var self = this;
        var html = '<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="password-change-overlay">'
            + '<div class="bg-base-100 rounded-lg p-6 w-96 shadow-xl">'
            + '<h3 class="text-lg font-bold mb-2">Change Your Password</h3>'
            + '<p class="text-sm text-base-content/70 mb-4">You must change your password before continuing.</p>'
            + '<form id="form-change-password" class="space-y-3">'
            + '<input type="password" id="cp-current" class="input input-bordered w-full" placeholder="Current password" required>'
            + '<input type="password" id="cp-new" class="input input-bordered w-full" placeholder="New password (min 12 chars)" required>'
            + '<input type="password" id="cp-confirm" class="input input-bordered w-full" placeholder="Confirm new password" required>'
            + '<p class="text-xs text-base-content/60">Requires: 12+ chars, uppercase, lowercase, number, special character</p>'
            + '<div id="cp-error" class="text-error text-sm hidden"></div>'
            + '<button type="submit" class="btn btn-primary w-full">Change Password</button>'
            + '</form></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('form-change-password').addEventListener('submit', function (e) {
            e.preventDefault();
            var current = document.getElementById('cp-current').value;
            var newPass = document.getElementById('cp-new').value;
            var confirm = document.getElementById('cp-confirm').value;
            var errEl = document.getElementById('cp-error');

            if (newPass !== confirm) {
                errEl.textContent = 'Passwords do not match';
                errEl.classList.remove('hidden');
                return;
            }

            YDB.API.post('/auth/change-password', { currentPassword: current, newPassword: newPass })
                .then(function (data) {
                    // Update token with full-access token
                    if (data.token) YDB.API.setToken(data.token);
                    document.getElementById('password-change-overlay').remove();
                    YDB.UI.toast('Password changed successfully', 'success');

                    // Complete setup if needed
                    YDB.API.post('/auth/complete-setup', {}).catch(function () { /* ok if not admin */ });

                    self.showSplashThenApp();
                })
                .catch(function (err) {
                    errEl.textContent = err.message || 'Failed to change password';
                    if (err.details) errEl.textContent += ': ' + err.details.join(', ');
                    errEl.classList.remove('hidden');
                });
        });
    },

    /**
     * Log out — clear tokens and session.
     */
    logout: function () {
        YDB.State.user = null;
        YDB.API.clearToken();
        sessionStorage.removeItem('ydb-user');
        document.getElementById('page-app').classList.add('hidden');
        document.getElementById('page-login').classList.remove('hidden');
    },

    /**
     * Show splash screen then transition to main app.
     */
    showSplashThenApp: function () {
        document.getElementById('page-login').classList.add('hidden');
        var splash = document.getElementById('page-splash');
        splash.classList.remove('hidden');

        setTimeout(function () {
            splash.classList.add('fade-out');
            setTimeout(function () {
                splash.classList.add('hidden');
                splash.classList.remove('fade-out');
                YDB.Auth.showApp();
            }, 400);
        }, YDB.Config.SPLASH_DURATION);
    },

    /**
     * Show main application and initialize all UI panels.
     */
    showApp: function () {
        document.getElementById('page-app').classList.remove('hidden');
        document.getElementById('display-user').textContent = YDB.State.user;

        // Render all panels
        YDB.Connections.render();
        YDB.History.render();
        YDB.Builder.renderTablesList();
        YDB.SavedQueries.render();
        YDB.ERD.populateConnections();
        YDB.Compare.populateSelects();
        YDB.Import.populateConnections();
        YDB.Templates.render();
        YDB.Dashboard.render();
        YDB.Users.render();
        YDB.FormBuilder.populateTables();
        YDB.Plugins.render();
        YDB.NLQ.populateConnections();

        YDB.UI.icons();
        YDB.UI.toast('Welcome, ' + YDB.State.user + '!', 'success');
    }
};
