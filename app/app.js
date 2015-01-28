require(['require-cnf'], function () {
    require(['jquery-ui'], function () {
        require(['main.js'], function (Client) {
            console.log('app start');

            // Test generate userId
            document.cookie = 'userId='+(Math.floor(Math.random()*100000))+"; path=/;";
            window.LogicGame = {isSuperUser:function(){return true;}};
            window.client = new Client({
                port: 8080,
                game:'test',
                resultDialogDelay: 1000,
                turnTime:10,
                reload: true,
                getUserParams: function(){return {gameType:'Main Mode'}},
                generateInviteText: function(invite){
                    return 'Вас пригласил пользователь ' + invite.from.userName
                        + ' в игру ' + invite.data.gameType;
                }
            }).init();


            var client = window.client;
            client.on('login', function(data){
                console.log('main;', 'login', data.userId, data.userName);
                var you =  client.getPlayer();
            });

            client.gameManager.on('game_start', function(data){
                console.log('main;','game_start, room: ', data);
            });

            client.gameManager.on('round_start', function(data){
                console.log('main;','round_start, room: ', data);
            });

            client.gameManager.on('turn', function(data){
                console.log('main;','turn', data.turn, 'is your turn: ', data.user == client.getPlayer().userId);
            });

            client.gameManager.on('switch_player', function(data){
                console.log('main;','switch_player', 'next: ', data, 'is your turn: ', data == client.getPlayer().userId);
            });

            client.gameManager.on('timeout', function(data){
                console.log('main;','timeout', 'user: ', data.user, 'is your timeout: ', data.user == client.getPlayer().userId);
            });

            client.gameManager.on('round_end', function(data){
                console.log('main;','round_end', data, 'your win: ', data.winner == client.getPlayer().userId);
            });

            client.gameManager.on('game_leave', function(data){
                console.log('main;','game_leave room:', data);
            });

            client.gameManager.on('time', function(data){
                console.log('main;','time user:', data);
            });

            client.on('show_profile', function(data){
                console.log('main;','show_profile user:', data);
            });




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
