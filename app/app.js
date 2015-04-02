require(['require-cnf'], function () {
    require(['jquery-ui'], function () {
        require(['main.js'], function (Client) {
            console.log('app start');

            var settingsTemplate = '<div><p>Цвет</p> <div> <label><input type="radio" name="color" value="red" >красный</label> <label><input type="radio" name="color" value="black" >черный</label> </div> </div> <p>Настройки игры</p> <div> <div class="option"> <label><input type="checkbox" name="sounds"> Включить звук</label> </div> <div class="option"> <label><input type="checkbox" name="disableInvite"> Запретить приглашать меня в игру</label> </div></div>';

            // Test generate userId
            //document.cookie = 'userId='+(Math.floor(Math.random()*100000000000000))+"; path=/;";
            window.LogicGame = {isSuperUser:function(){return true;}};
            window._client = new Client({
                game: 'test2',
                port: 8078,
                resultDialogDelay: 1000,
                reload: true,
                getUserParams: function(){return {gameType:'Main Mode'}},
                generateInviteText: function(invite){
                    return 'Вас пригласил пользователь ' + invite.from.userName + '(' + invite.from.getRank(invite.data.mode)+ ' место в рейтинге)'
                        + ' в игру ' + invite.data.gameType + ' в режим ' + _client.getModeAlias(invite.data.mode);
                },
                initRating: function(conf){
                    conf.columns.splice(conf.columns.length-2, 0, {
                        id:'score', source:'score', title:'Очки', canOrder:true, undef: 100
                    });
                    return conf;
                },
                initHistory: function(conf){
                    conf.columns.push({
                        id:'score', source:'score', title:'Очки', undef: 100
                    });
                    return conf;
                },
                blocks:{
                    userListId:'userListDiv',
                    chatId:'chatDiv',
                    ratingId:'ratingDiv',
                    historyId:'historyDiv'
                },
                images:{
                    close: 'i/close.png',
                    spin:  'i/spin.gif',
                    sortAsc:  'i/sort-asc.png',
                    sortDesc:  'i/sort-desc.png',
                    sortBoth:  'i/sort-both.png',
                    del: 'i/delete.png'
                },
                sounds: {
                        start: {
                            src: 'audio/v6-game-start.ogg'
                        },
                        turn: {
                            src: 'audio/v6-game-turn.ogg',
                            volume: 0.5,
                            enable: false
                        },
                        win: {
                            src: 'audio/v6-game-win.ogg'
                        },
                        lose: {
                            src: 'audio/v6-game-lose.ogg'
                        },
                        invite: {
                            src: 'audio/v6-invite.ogg'
                        },
                        timeout: {
                            src: 'audio/v6-timeout.ogg'
                        }
                },
                settings:{
                    color: 'red',
                    sounds: false
                },
                settingsTemplate: settingsTemplate
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
                console.log('main;','switch_player', 'next: ', data, 'your next: ', data.userId == _client.getPlayer().userId);
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

            _client.gameManager.on('game_load', function(data){
                console.log('main;','game_loaded, game history:', data);
            });

            _client.gameManager.on('time', _.throttle(function(data){
                console.log('main;','time user:', data);
            }, 5000));

            _client.historyManager.on('game_load', function(game){
                console.log('main;','history game loaded, game:', game);
            });

            _client.on('show_profile', function(data){
                console.log('main;','show_profile user:', data);
            });

            _client.on('settings_changed', function(data){
                console.log('main;','settings_changed property:', data);
            });

            _client.on('settings_saved', function(data){
                console.log('main;','settings_changed settings:', data);
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
