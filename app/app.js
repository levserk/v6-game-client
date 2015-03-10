require(['require-cnf'], function () {
    require(['jquery-ui'], function () {
        require(['main.js'], function (Client) {
            console.log('app start');

            // Test generate userId
            //document.cookie = 'userId='+(Math.floor(Math.random()*100000000000000))+"; path=/;";
            window.LogicGame = {isSuperUser:function(){return true;}};
            window._client = new Client({
                port: 8078,
                resultDialogDelay: 1000,
                reload: true,
                getUserParams: function(){return {gameType:'Main Mode'}},
                generateInviteText: function(invite){
                    return 'Вас пригласил пользователь ' + invite.from.userName + '(' + invite.from.getRank(invite.data.mode)+ ' место в рейтинге)'
                        + ' в игру ' + invite.data.gameType + ' в режим ' + _client.getModeAlias(invite.data.mode);
                },
                blocks:{
                    userListId:'userListDiv',
                    chatId:'chatDiv',
                    ratingId:'ratingDiv',
                    historyId:'historyDiv'
                }
            }).init();

            var _client = window._client;
            _client.on('login', function(data){
                console.log('main;', 'login', data.userId, data.userName);
                var you =  _client.getPlayer();
            });

            _client.gameManager.on('game_start', function(data){
                console.log('main;','game_start, room: ', data);
            });

            _client.gameManager.on('round_start', function(data){
                console.log('main;','round_start, room: ', data);
            });

            _client.gameManager.on('turn', function(data){
                console.log('main;','turn', data.turn, 'is your turn: ', data.user == _client.getPlayer().userId);
            });

            _client.gameManager.on('switch_player', function(data){
                console.log('main;','switch_player', 'next: ', data, 'is your turn: ', data == _client.getPlayer().userId);
            });

            _client.gameManager.on('event', function(data){
                console.log('main;','event', data);
            });

            _client.gameManager.on('timeout', function(data){
                console.log('main;','timeout', 'user: ', data.user, 'is your timeout: ', data.user == _client.getPlayer().userId);
            });

            _client.gameManager.on('round_end', function(data){
                console.log('main;','round_end', data, 'your win: ', data.winner == _client.getPlayer().userId);
            });

            _client.gameManager.on('game_leave', function(data){
                console.log('main;','game_leave room:', data);
            });

            _client.gameManager.on('time', function(data){
                console.log('main;','time user:', data);
            });

            _client.on('show_profile', function(data){
                console.log('main;','show_profile user:', data);
            });


            // send events buttons example
            _generateEndGameBtn();

            function _generateEndGameBtn() {
                var div = $('<div>');
                div.attr('id', 'endGameButton');
                div.html('<span>Выйти из игры</span>');
                div.on('click', function () {
                    window._client.gameManager.leaveGame();
                });
                $('body').append(div);

                div = $('<div>');
                div.attr('id', 'drawButton');
                div.html('<span>Предложить ничью</span>');
                div.on('click', function () {
                    window._client.gameManager.sendDraw();
                });
                $('body').append(div);

                div = $('<div>');
                div.attr('id', 'winButton');
                div.html('<span>Победный ход</span>');
                div.on('click', function () {
                    window._client.gameManager.sendTurn({result:1});
                });
                $('body').append(div);

                div = $('<div>');
                div.attr('id', 'ratingButton');
                div.html('<span>Показать рейтинг</span>');
                div.on('click', function () {
                    window._client.ratingManager.getRatings();
                });
                $('body').append(div);

                div = $('<div>');
                div.attr('id', 'historyButton');
                div.html('<span>Показать историю</span>');
                div.on('click', function () {
                    window._client.historyManager.getHistory(false, false, false);
                });
                $('body').append(div);
            }
        });
    });
});
