define(['client', 'views/user_list', 'views/dialogs'], function(Client, userListView, dialogsView) {
    // TODO client is global(make singleton)
    // TODO css images not found)
    'use strict';

    console.log('main;', new Date(), 'ready');

    document.cookie = 'userId='+(Math.floor(Math.random()*100000))+"; path=/;";

    window.client = new Client({domain:'localhost'});

    client.init();
    _generateEndGameBtn();
    _initViews();

    function _generateEndGameBtn() {
        var div = $('<div>');
        div.attr('id', 'endGameButton');
        div.html('<span>Выйти из игры</span>');
        div.on('click', function() {
            client.gameManager.leaveGame();
        });
        $('body').append(div);
    }
    function _initViews() {
        new userListView();
        dialogsView.init();
    }
});
