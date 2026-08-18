/**
 * @file auth.js
 * @description Authentication module — login, logout, splash screen.
 * Uses API when backend is online, falls back to mock credentials when offline.
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

        // Check for existing token (API mode) or session (mock mode)
        if (YDB.API.token) {
            // Verify token is still valid
            YDB.API.get('/auth/me').then(function (user) {
                YDB.API.online = true;
                YDB.State.user = user.username;
                self.showSplashThenApp();
            }).catch(function () {
                YDB.API.clearToken();
                // Fallback to mock session check
                self._checkMockSession();
            });
        } else {
            self._checkMockSession();
        }
    },

    /** @private Check mock session (localStorage-based) */
    _checkMockSession: function () {
        if (sessionStorage.getItem('ydb-user')) {
            YDB.State.user = sessionStorage.getItem('ydb-user');
            this.showSplashThenApp();
        }
    },

    /**
     * Login — try API first, fallback to mock.
     */
    login: function () {
        var self = this;
        var username = document.getElementById('input-username').value;
        var password = document.getElementById('input-password').value;

        if (!username || !password) {
            YDB.UI.toast('Enter username and password', 'warning');
            return;
        }

        // Try API login
        YDB.API.post('/auth/login', { username: username, password: password })
            .then(function (data) {
                YDB.API.online = true;
                YDB.API.setToken(data.token);
                YDB.State.user = data.user.username;
                self.showSplashThenApp();
            })
            .catch(function (err) {
                // If API is down, fallback to mock credentials
                if (err.status === 401 || err.status === 403) {
                    YDB.UI.toast('Invalid credentials', 'error');
                } else {
                    // API unreachable — use mock mode
                    self._mockLogin(username, password);
                }
            });
    },

    /** @private Mock login for offline/demo mode */
    _mockLogin: function (username, password) {
        if (username === 'admin' && (password === 'password' || password === 'admin123')) {
            YDB.State.user = username;
            sessionStorage.setItem('ydb-user', username);
            this.showSplashThenApp();
            YDB.UI.toast('Running in offline mode (mock data)', 'info');
        } else {
            YDB.UI.toast('Invalid credentials. Try admin/password', 'error');
        }
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

        YDB.UI.icons();
        var mode = YDB.API.isOnline() ? '' : ' (offline mode)';
        YDB.UI.toast('Welcome, ' + YDB.State.user + '!' + mode, 'success');
    }
};
