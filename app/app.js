require(['main.js'], function (Client) {
    console.log('app start');

    // Test generate userId
    document.cookie = 'userId='+(Math.floor(Math.random()*100000))+"; path=/;";

    window.client = new Client().init();

    _generateEndGameBtn();

    function _generateEndGameBtn() {
        var div = $('<div>');
        div.attr('id', 'endGameButton');
        div.html('<span>Выйти из игры</span>');
        div.on('click', function () {
            window.client.gameManager.leaveGame();
        });
        $('body').append(div);
    }
});