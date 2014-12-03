document.ready = function(){
    start();
};

var clients = [];

function loginClient(){
    var id = Math.floor(Math.random()*100000);
    document.cookie = 'userId='+id+"; path=/;";
    var client = new Client({domain:'localhost'});
    client.init();
    client.id = id;
    return client;
}

function start() {
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
                res(true);
            });
        });
    }).then(function(){
        console.log('imitation;','done!');
    });
}
