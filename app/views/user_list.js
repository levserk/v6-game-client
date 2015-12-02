define(['underscore', 'backbone', 'text!tpls/userListFree.ejs', 'text!tpls/userListInGame.ejs', 'text!tpls/userListMain.ejs'],
    function(_, Backbone, tplFree, tplInGame, tplMain) {
    'use strict';
    var UserListView = Backbone.View.extend({
        tagName: 'div',
        id: 'userList',
        tplFree: _.template(tplFree),
        tplInGame: _.template(tplInGame),
        tplMain: _.template(tplMain),
        events: {
            'click .inviteBtn': '_inviteBtnClicked',
            'click .userListFree .userName': 'userClick',
            'click .userListGame': 'roomClick',
            'click .tabs div': 'clickTab',
            'click .disconnectButton': '_reconnect',
            'click #randomPlay': 'playClicked',
            'keyup #filterUserList': 'filter',
            'mouseenter ': 'mouseEnter',
            'mouseleave ': 'mouseLeave'
        },
        _reconnect: function() {
            this.client.reconnect();
            this.$list.html(this.$loadingTab);
        },
        clickTab: function(e) {
            if (!this.client.socket.isConnected) {
                return;
            }

            var target = $(e.currentTarget),
                clickedTabName = target.attr('data-type');

            if (clickedTabName === this.currentActiveTabName) {
                return;
            }
            this._setActiveTab(clickedTabName);
            this.render();
        },
        userClick: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');
            this.client.onShowProfile(userId);
        },
        roomClick: function(e) {
            var target = $(e.currentTarget),
                roomId = target.attr('data-Id');
            if (roomId) {
                this.$el.find('.userListGame').removeClass('currentGame');
                $(target).addClass('currentGame');
                this.client.gameManager.spectate(roomId);
            } else {
                console.warn('wrong room id', roomId);
            }
        },
        _inviteBtnClicked: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');
            this.invitePlayer(userId)
        },
        invitePlayer: function(userId) {
            if (this.client.gameManager.inGame()) {
                console.warn('You are already in game!');
                return;
            }

            var target = this.$el.find('.inviteBtn[data-userId="' + userId + '"]');

            if (target.hasClass(this.ACTIVE_INVITE_CLASS)) {
                // cancel invite
                this.client.inviteManager.cancel();
                target.removeClass(this.ACTIVE_INVITE_CLASS);
                target.html(this.locale.buttons.invite);
            } else {
                // send invite
                this.$el.find('.' + this.ACTIVE_INVITE_CLASS).html(this.locale.buttons.invite).removeClass(this.ACTIVE_INVITE_CLASS);
                var params = (typeof this.client.opts.getUserParams == 'function' ? this.client.opts.getUserParams() : {});
                params = $.extend(true, {}, params);
                this.client.inviteManager.sendInvite(userId, params);
                target.addClass(this.ACTIVE_INVITE_CLASS);
                target.html(this.locale.buttons.cancel);
            }
        },
        playClicked: function (e) {
            this.client.inviteManager.playRandom(this.client.inviteManager.isPlayRandom);
            this._setRandomPlay();
        },
        filter: function () {
            this.render();
        },
        mouseEnter: function(){
            this.mouseOver = true
        },
        mouseLeave: function(){
            this.mouseOver = false;
        },

        initialize: function(_client) {
            var bindedRender = this.render.bind(this);
            this.images = _client.opts.images;
            this.client = _client;
            this.locale = _client.locale.userList;
            this.mouseOver = false;

            this.$disconnectedTab = $('<tr class="disconnected"><td><div>' +
                '<span class="disconnectText">' + this.locale.disconnected.text + '</span>' +
                '<br>' +
                '<br>' +
                '<span class="disconnectButton">' + this.locale.disconnected.button + '</span>' +
                '</div></td></tr>');
            this.$loadingTab = $('<tr><td>' + this.locale.disconnected.status + '</td></tr>');
            this.$el.html(this.tplMain(this.locale));
            this.$el.addClass('v6-block-border');

            this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
            this.ACTIVE_TAB_CLASS = 'activeTab';

            this.TEXT_PLAY_ACTIVE = this.locale.buttons.cancelPlayRandom;
            this.TEXT_PLAY_UNACTIVE = this.locale.buttons.playRandom;

            this.IN_GAME_CLASS = 'inGame';
            this.NOT_IN_GAME_CLASS = 'NotInGame';

            this.$list = this.$el.find('.tableWrap table');
            this.$container = this.$el.find('.tableWrap');
            this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
            this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');
            this.$counterSpectators = this.$el.find('.tabs div[data-type="spectators"]').find('span');
            this.$btnPlay = this.$el.find('#randomPlay');
            this.$filter = this.$el.find('#filterUserList');
            this.$tabs = this.$el.find('.tabs');

            this.listenTo(this.client.userList, 'new_user', bindedRender);
            this.listenTo(this.client, 'mode_switch', bindedRender);
            this.listenTo(this.client.userList, 'update', bindedRender);
            this.listenTo(this.client.userList, 'leave_user', bindedRender);
            this.listenTo(this.client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
            this.listenTo(this.client.userList, 'new_room', bindedRender);
            this.listenTo(this.client.userList, 'close_room', bindedRender);
            this.listenTo(this.client.userList, 'user_changed', bindedRender);
            this.listenTo(this.client.userList, 'waiting', bindedRender);
            this.listenTo(this.client, 'disconnected', bindedRender);
            this.listenTo(this.client, 'user_relogin', bindedRender);
            this.listenTo(this.client.gameManager, 'spectator_join', bindedRender);
            this.listenTo(this.client.gameManager, 'spectator_leave', bindedRender);
            this.listenTo(this.client.gameManager, 'game_start', this.showSpectatorsTab.bind(this));
            this.listenTo(this.client.gameManager, 'game_leave', this.hideSpectatorsTab.bind(this));
            this._setActiveTab('free');
            this.$list.html(this.$loadingTab);
            this.randomPlay = false;
        },
        _setRandomPlay: function(){
            if (this.client.inviteManager.isPlayRandom) {
                this.$btnPlay.html(this.TEXT_PLAY_ACTIVE);
                this.$btnPlay.addClass('active');
            } else {
                this.$btnPlay.html(this.TEXT_PLAY_UNACTIVE);
                this.$btnPlay.removeClass('active');
            }
        },
        showSpectatorsTab: function(){
            if (!this.client.opts.showSpectators) return;
            this.$tabs.removeClass(this.NOT_IN_GAME_CLASS);
            this.$tabs.addClass(this.IN_GAME_CLASS);
            this.$el.find('.tabs div[data-type="' + 'spectators' + '"]').show();
            this.render();
        },
        hideSpectatorsTab: function(){
            if (!this.client.opts.showSpectators) return;
            if (this.currentActiveTabName == 'spectators'){
                this._setActiveTab('free');
            }
            this.$tabs.addClass(this.NOT_IN_GAME_CLASS);
            this.$tabs.removeClass(this.IN_GAME_CLASS);
            this.$el.find('.tabs div[data-type="' + 'spectators' + '"]').hide();
        },
        _setActiveTab: function(tabName) {
            this.currentActiveTabName = tabName;
            this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
            this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
        },
        _setCounters: function() {
            if (!this.client.socket.isConnected) {
                this.$counterFree.html('');
                this.$counterinGame.html('');
                this.hideSpectatorsTab();
                return;
            }

            this.$counterFree.html('(' + this.client.userList.getUserList().length + ')');
            this.$counterinGame.html('(' + this.client.userList.getRoomList().length * 2 + ')');
            this.$counterSpectators.html('(' + this.client.userList.getSpectatorsList().length + ')');
        },
        _showPlayerListByTabName: function() {
            if (!this.client.socket.isConnected) {
                this.$list.html(this.$disconnectedTab);
                return;
            }

            switch(this.currentActiveTabName) {
                case 'free':
                    this.$list.html(this.tplFree({
                        users: this.client.userList.getUserList(this.getFilter()),
                        locale: this.locale,
                        imgBlock: this.images.block
                    }));
                    if (!this.mouseOver) this.scrollToUser();
                    break;
                case 'inGame':
                    this.$list.html(this.tplInGame({
                        rooms: this.client.userList.getRoomList(this.getFilter())
                    }));
                    break;
                case 'spectators':
                    this.$list.html(this.tplFree({
                        users: this.client.userList.getSpectatorsList(this.getFilter()),
                        locale: this.locale,
                        imgBlock: this.images.block
                    }));
                    break;
                default: console.warn('unknown tab', this.currentActiveTabName);
            }
        },
        onRejectInvite: function(invite) {
            this.$el.find('.' + this.ACTIVE_INVITE_CLASS + '[data-userId="' + invite.user.userId + '"]').html(this.locale.buttons.invite).removeClass(this.ACTIVE_INVITE_CLASS);
        },
        render: function() {
            if (this.client.unload) return;
            setTimeout(this._showPlayerListByTabName.bind(this),1);
            this._setCounters();
            return this;
        },
        scrollToUser: function(){
            if (this.currentActiveTabName != 'free') return;
            var scrollTo = this.$el.find('.userListPlayer');
            if (scrollTo.length) {
                scrollTo = scrollTo.offset().top - this.$container.offset().top
                         + this.$container.scrollTop() - this.$container.height() / 2;
                this.$container.scrollTop(scrollTo);
            }
        },
        getFilter: function() {
            var filter = this.$filter.val().toLowerCase().trim();
            if (filter.length == 0) filter = false;
            return filter;
        },

        addInviteFriendButton: function() {
            var div = $('<div>');
            var block = $('#left-block');
            if (!block.length) return;
            div.attr('id', 'vkInviteFriend');
            div.addClass('btn');
            div.html('Пригласить Друга');
            div.width((block.width() || 255) - 10);
            div.css('top' , block.position().top + block.height() + 25 + 'px');
            div.on('click', this.client.vkInviteFriend.bind(this.client));
            this.$el.append(div);
        }
    });
    return UserListView;
});