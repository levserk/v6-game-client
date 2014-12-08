var dialogs = (function() {
    'use strict';
    var INVITE_CLASS = 'dialogInvite';

    function _subscribe() {
        client.inviteManager.on('new_invite', _newInvite);
        client.inviteManager.on('reject_invite', _rejectInvite);
        client.inviteManager.on('cancel_invite', _cancelInvite);
        client.inviteManager.on('remove_invite', _removeInvite);
    }

    function _newInvite(obj) {
        var div = $('<div>');
        div.addClass(INVITE_CLASS);
        div.attr('data-fromId', obj.from.userId);

        div.html('Вас пригласил в игру пользователь ' + obj.from.userName).dialog({
            resizable: false,
            modal: true,
            buttons: {
                "Принять": function() {
                    //client.inviteManager.accept(this.attr('data-fromId'));
                    $( this ).dialog( "close" );
                    this.remove();
                },
                "Отклонить": function() {
                    client.inviteManager.reject(this.getAttribute('data-fromId'));
                    $( this ).dialog( "close" );
                    this.remove();
                }
            }
        });
    }

    function _rejectInvite(opt) {

    }

    function _cancelInvite(opt) {

    }

    function _removeInvite(opt) {

    }

    return {
        init: _subscribe
    };
}());
