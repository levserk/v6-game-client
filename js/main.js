require(['require-cnf'], function() {
    require(['client'], function(client, userListView, dialogsView) {
        'use strict';

        console.log('main;', new Date(), 'ready', _getCookie('userId'));

        document.cookie = 'userId='+(Math.floor(Math.random()*100000))+"; path=/;";

        window.app = {
            client: new Client({domain:'localhost'})
        };

        window.app.client.init();

        client.init();
        _initViews();
        $('#endGameButton').on('click', function() {
            client.gameManager.leaveGame();
        });

        function _getCookie(name) {
            var matches = document.cookie.match(new RegExp(
                    "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
            ));
            return matches ? decodeURIComponent(matches[1]) : undefined;
        }

        function _initViews() {
            new userListView({el: $('#userList')});
            dialogsView.init();
        }
    });
});