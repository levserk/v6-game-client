require(['require-cnf'], function () {
    require(['jquery-ui'], function () {
        require(['main.js'], function (Client) {
            console.log('app start');

            // Test generate userId
            //document.cookie = 'userId='+(Math.floor(Math.random()*100000))+"; path=/;";

            window.client = new Client({
                port: 8080,
                domain: 'localhost',
                resultDialogDelay: 1000,
                reload: true,
                getUserParams: function(){return {gameType:'Main Mode'}},
                generateInviteText: function(invite){
                    return 'Вас пригласил пользователь ' + invite.from.userName
                        + ' в игру ' + invite.data.gameType;
                }
            }).init();

            _generateEndGameBtn();

            function _generateEndGameBtn() {
                var div = $('<div>');
                div.attr('id', 'endGameButton');
                div.html('<span>Выйти из игры</span>');
                div.on('click', function () {
                    window.client.gameManager.leaveGame();
                });
                $('body').append(div);

                div = $('<div>');
                div.attr('id', 'drawButton');
                div.html('<span>Предложить ничью</span>');
                div.on('click', function () {
                    window.client.gameManager.sendDraw();
                });
                $('body').append(div);

                div = $('<div>');
                div.attr('id', 'winButton');
                div.html('<span>Победный ход</span>');
                div.on('click', function () {
                    window.client.gameManager.sendTurn({result:1});
                });
                $('body').append(div);

            }
        });
    });
});
