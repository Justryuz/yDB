/**
 * YDB - Collaboration
 * Share connections/queries with team members via link (mock).
 */
YDB.Collab = {
    init: function () {
        var self = this;
        document.getElementById('btn-copy-link').addEventListener('click', function () { self.copyLink(); });
        document.getElementById('btn-send-invite').addEventListener('click', function () { self.sendInvite(); });
    },

    open: function (type, data) {
        // Generate a mock share link
        var id = btoa(JSON.stringify({ type: type, id: Date.now(), data: data ? data.substring(0, 50) : '' }));
        var link = window.location.origin + '/share/' + id.substring(0, 20);
        document.getElementById('collab-link').value = link;
        document.getElementById('modal-collab').showModal();
    },

    copyLink: function () {
        var input = document.getElementById('collab-link');
        navigator.clipboard.writeText(input.value).then(function () {
            YDB.UI.toast('Link copied!', 'success');
        });
    },

    sendInvite: function () {
        var email = document.getElementById('collab-email').value.trim();
        var perm = document.getElementById('collab-perm').value;
        if (!email) { YDB.UI.toast('Enter an email', 'warning'); return; }

        // Mock send
        YDB.UI.toast('Invitation sent to ' + email + ' (' + perm + ')', 'success');
        document.getElementById('collab-email').value = '';
    }
};
