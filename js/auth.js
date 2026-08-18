/**
 * @file auth.js
 * @description Authentication module — login, logout, splash screen, session management.
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

        // Auto-login from existing session
        if (sessionStorage.getItem('ydb-user')) {
            YDB.State.user = sessionStorage.getItem('ydb-user');
            this.showSplashThenApp();
        }
    },

    /**
     * Attempt login with form credentials.
     * Demo credentials: admin / password
     */
    login: function () {
        var user = document.getElementById('input-username').value;
        var pass = document.getElementById('input-password').value;

        if (user === 'admin' && pass === 'password') {
            YDB.State.user = user;
            sessionStorage.setItem('ydb-user', user);
            this.showSplashThenApp();
        } else {
            YDB.UI.toast('Invalid credentials. Try admin/password', 'error');
        }
    },

    /**
     * Log out current user and return to login screen.
     */
    logout: function () {
        YDB.State.user = null;
        sessionStorage.removeItem('ydb-user');
        document.getElementById('page-app').classList.add('hidden');
        document.getElementById('page-login').classList.remove('hidden');
    },

    /**
     * Show splash screen with logo animation, then transition to main app.
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

        // Render all panels that need initial data
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
        YDB.UI.toast('Welcome back, ' + YDB.State.user + '!', 'success');
    }
};
