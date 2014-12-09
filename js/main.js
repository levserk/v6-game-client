var client,
    views = {};



document.ready = function(){
    console.log('main;', new Date(), 'ready', getCookie('userId'));
    document.cookie = 'userId='+(Math.floor(Math.random()*100000))+"; path=/;";
    client = new Client({domain:'localhost'});
    client.init();
    dialogs.init();
    _initViews();
};


function getCookie(name) {
    var matches = document.cookie.match(new RegExp(
        "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
    ));
    return matches ? decodeURIComponent(matches[1]) : undefined;
}

function _initViews() {
    views.userList = new UserListView({el: $('#userList')});
}

var dialogManager = function() {

};