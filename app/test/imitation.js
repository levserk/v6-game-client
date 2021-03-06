require(['../require-cnf'], function() {
    require(['jquery-ui'], function() {
        require(['client', 'views/user_list', 'views/dialogs'], function(Client, userListView, dialogsView) {
            var clients = [];

            clients[0] = loginClient();
            clients[1] = loginClient();
            clients[2] = loginClient();
            console.log('imitation;','login users');
            // connect two players
            Promise.all([new Promise(function (res) {
                clients[0].userList.on('new_user', function (user) {
                    if (user.userId == clients[1].id) {
                        res(true);
                        clients[0].userList.removeListener('user_add');
                    }
                });
            }), new Promise(function (res) {
                clients[1].userList.on('new_user', function (user) {
                    if (user.userId == clients[0].id) {
                        res(true);
                        clients[1].userList.removeListener('user_add');
                    }
                });
            })]).then(function () {
                console.log('imitation;','step1, two players login', clients[0].userList.users, clients[0].userList.users.length == clients[1].userList.users.length);

                // send invite to other player
                clients[0].inviteManager.sendInvite(clients[1].id);

                return new Promise(function (res) {
                    clients[1].inviteManager.on('new_invite', function(invite){
                        console.log('imitation;','invite!', invite);
                        res(invite);
                    });
                });
            }).then(function (invite) {
                //send accept and wait game;
                clients[1].inviteManager.accept(invite.from.userId);
                return new Promise(function(res){
                    clients[0].gameManager.on('game_start',function(room){
                        console.log('imitation;', 'game_start', room);
                        console.log('imitation;', 'playerList', clients[0].userList.getUserList());
                        console.log('imitation;', 'roomList', clients[0].userList.getRoomList());
                        clients[0].socket.ws.close();
                    });
                    clients[1].gameManager.on('user_leave', function(user){
                        console.log('imitation;', 'user_leave', user);
                    });
                    clients[1].gameManager.on('game_end',function(room){
                        console.log('imitation;', 'game_end', room);
                        console.log('imitation;', 'playerList', clients[0].userList.getUserList());
                        console.log('imitation;', 'roomList', clients[0].userList.getRoomList());
                        res(true);
                    });
                })
            }).then(function(){
                console.log('imitation;','done!');
            });

            function loginClient(){
                var id = Math.floor(Math.random()*100000);
                document.cookie = 'userId='+id+"; path=/;";
                var client = new Client({domain:'localhost'});
                client.init();
                client.id = id;
                return client;
            }
        });
    });
});