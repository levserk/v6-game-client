require(['main.js'], function() {
        console.log('app start', window.client);
        _generateEndGameBtn();

        function _generateEndGameBtn() {
            var div = $('<div>');
            div.attr('id', 'endGameButton');
            div.html('<span>Выйти из игры</span>');
            div.on('click', function() {
                client.gameManager.leaveGame();
            });
            $('body').append(div);
        }
});