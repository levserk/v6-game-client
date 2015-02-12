define(['EE', 'views/rating'], function(EE, RatingView) {
    'use strict';

    var RatingManager = function (client) {
        this.client = client;
        this.currentRoom = null;
        var conf = {
            tabs:[
                {id: 'all_players', title: 'все игроки'},
                {id: 'online_players', title: 'сейчас на сайте'}
            ],
            subTabs:[
                {id: 'mode1', title: 'mode1'},
                {id: 'mode2', title: 'mode2'}
            ],
            columns:[
                {  id:'Rank',     source:'rank',        title:'Место' },
                {  id:'UserName', source:'userName',    title:'Имя' },
                {  id:'Elo',      source:'ratingElo',   title:'Рейтинг <br> эло',           canOrder:true },
                {  id:'Victory',  source:'win',         title:'Выйграл <br> у соперников',  canOrder:true },
                {  id:'Percent',  source:'percent',     title:' % ',                        canOrder:true },
                {  id:'Date',     source:'dateCreate',  title:'Дата <br> Регистрации',      canOrder:true }
            ]
        };

        this.ratingView = new RatingView(conf);
        this.$container = (client.opts.blocks.ratingId?$('#'+client.opts.blocks.ratingId):$('body'));
    };

    RatingManager.prototype = new EE();


    RatingManager.prototype.onMessage = function (message) {
        var data = message.data, i;
        console.log('rating_manager;', 'message', message);
        switch (message.type) {
            case 'ratings': this.onRatingsLoad(data.mode, data.ratings); break;
        }
    };


    RatingManager.prototype.onRatingsLoad = function (mode, ratings){
        if (ratings.infoUser) {
            ratings.infoUser = this.formatRatingsRow(mode, ratings.infoUser);
        }
        for (var i = 0; i < ratings.allUsers.length; i++) ratings.allUsers[i] = this.formatRatingsRow(mode, ratings.allUsers[i]);
        setTimeout(function(){this.$container.append(this.ratingView.render(ratings).$el); }.bind(this),500);
    };


    RatingManager.prototype.formatRatingsRow = function(mode, info){
        var row = {
            userId: info.userId,
            userName: info.userName,
            photo: undefined
        };
        for (var i in info[mode]){
            row[i] = info[mode][i];
        }
        if (this.client.getPlayer() && info.userId == this.client.getPlayer().userId) row.user = true;
        if (this.client.userList.getUser(info.userId)) row.active = true;
        row.percent = Math.floor(row.win/row.games*100);
        if (Date.now() - info.dateCreate < 172800000) row.dateCreate = this.ratingView.NOVICE;
        else row.dateCreate = formatDate(info.dateCreate);
        return row;
    };


    RatingManager.prototype.getRatings = function(mode){
        this.$container.append(this.ratingView.render(false).$el);
        client.send('rating_manager', 'ratings', 'server', {mode:mode||this.client.currentMode});
    };

    function formatDate(time) {
        var date = new Date(time);
        var day = date.getDate();
        var month = date.getMonth() + 1;
        var year = ("" + date.getFullYear()).substr(2, 2);
        return ext(day, 2, "0") + "." + ext(month, 2, "0") + "."  + year;
        function ext(str, len, char) {
            //char = typeof (char) == "undefined" ? "&nbsp;" : char;
            str = "" + str;
            while (str.length < len) {
                str = char + str;
            }
            return str;
        }
    }

    RatingManager.prototype.testRatings = {"allUsers":[{"userId":"95514","userName":"us_95514","dateCreate":1423486149906,"mode1":{"win":2,"lose":0,"draw":0,"games":2,"rank":1,"ratingElo":1627},"mode2":{"win":1,"lose":0,"draw":0,"games":1,"rank":1,"ratingElo":1615}},{"userId":"93361","userName":"us_93361","dateCreate":1423486098554,"mode1":{"win":1,"lose":0,"draw":0,"games":1,"rank":2,"ratingElo":1615},"mode2":{"win":0,"lose":0,"draw":0,"games":0,"rank":0,"ratingElo":1600}},{"userId":"99937","userName":"us_99937","dateCreate":1423486099570,"mode1":{"win":0,"lose":3,"draw":0,"games":3,"rank":3,"ratingElo":1561},"mode2":{"win":0,"lose":1,"draw":0,"games":1,"rank":2,"ratingElo":1586}}],"infoUser":{"userId":"99937","userName":"us_99937","dateCreate":1423486099570,"mode1":{"win":0,"lose":3,"draw":0,"games":3,"rank":3,"ratingElo":1561},"mode2":{"win":0,"lose":1,"draw":0,"games":1,"rank":2,"ratingElo":1586}}};
    return RatingManager;
});