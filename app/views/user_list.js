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
            'click .userName': 'userClick',
            'click .userListGame': 'roomClick',
            'click .tabs div': 'clickTab',
            'click .disconnectButton': '_reconnect',
            'click #randomPlay': 'playClicked'
        },
        _reconnect: function() {
            if (this.client.opts.reload) {
                location.reload(false);
                return;
            }
            this.$list.html(this.$loadingTab);
            this.client.socket.init();
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

            this.currentActiveTabName = clickedTabName;
            this._setActiveTab(this.currentActiveTabName);
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
                target.html('Пригласить');
            } else {
                // send invite
                this.$el.find('.' + this.ACTIVE_INVITE_CLASS).html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
                var params = (typeof this.client.opts.getUserParams == 'function' ? this.client.opts.getUserParams() : {});
                params = $.extend(true, {}, params);
                this.client.inviteManager.sendInvite(userId, params);
                target.addClass(this.ACTIVE_INVITE_CLASS);
                target.html('Отмена');
            }
        },
        playClicked: function (e) {
            this.client.inviteManager.playRandom(this.client.inviteManager.isPlayRandom);
            this._setRandomPlay();
        },
        initialize: function(_client) {
            var bindedRender = this.render.bind(this);

            this.client = _client;

            this.$disconnectedTab = $('<tr class="disconnected"><td><div>' +
                '<span class="disconnectText">Соединение с сервером отсутствует</span>' +
                '<br>' +
                '<br>' +
                '<span class="disconnectButton">Переподключиться</span>' +
                '</div></td></tr>');
            this.$loadingTab = $('<tr><td>Загрузка..</td></tr>');
            this.$el.html(this.tplMain());
            // append user list
            if (_client.opts.blocks.userListId)
                $('#'+_client.opts.blocks.userListId).append(this.el);
            else
                $('body').append(this.el);

            this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
            this.ACTIVE_TAB_CLASS = 'activeTab';

            this.TEXT_PLAY_ACTIVE = 'Идет подбор игрока...';
            this.TEXT_PLAY_UNACTIVE = 'Играть с любым';

            this.$list = this.$el.find('.tableWrap table');
            this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
            this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');
            this.$btnPlay = this.$el.find('#randomPlay');

            this.listenTo(this.client.userList, 'new_user', bindedRender);
            this.listenTo(this.client, 'mode_switch', bindedRender);
            this.listenTo(this.client.userList, 'update', bindedRender);
            this.listenTo(this.client.userList, 'leave_user', bindedRender);
            this.listenTo(this.client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
            this.listenTo(this.client.userList, 'new_room', bindedRender);
            this.listenTo(this.client.userList, 'close_room', bindedRender);
            this.listenTo(this.client.userList, 'user_changed', bindedRender);
            this.listenTo(this.client, 'disconnected', bindedRender);
            this.listenTo(this.client, 'user_relogin', bindedRender);

            this.currentActiveTabName = 'free';
            this._setActiveTab(this.currentActiveTabName);
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
        _setActiveTab: function(tabName) {
            this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
            this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
        },
        _setCounters: function() {
            if (!this.client.socket.isConnected) {
                this.$counterFree.html('');
                this.$counterinGame.html('');
                return;
            }

            this.$counterFree.html('(' + this.client.userList.getUserList().length + ')');
            this.$counterinGame.html('(' + this.client.userList.getRoomList().length * 2 + ')');
        },
        _showPlayerListByTabName: function() {
            // default

            if (!this.client.socket.isConnected) {
                this.$list.html(this.$disconnectedTab);
                return;
            }

            if (this.currentActiveTabName === 'free') {
                this.$list.html(this.tplFree({
                    users: this.client.userList.getUserList()
                }));
            }
            else if (this.currentActiveTabName === 'inGame') {
                this.$list.html(this.tplInGame({
                    rooms: this.client.userList.getRoomList()
                }));
            } else {
                console.warn('unknown tab', this.currentActiveTabName);
            }
        },
        onRejectInvite: function(invite) {
            this.$el.find('.' + this.ACTIVE_INVITE_CLASS + '[data-userId="' + invite.user.userId + '"]').html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
        },
        render: function() {
            if (this.client.unload) return;
            setTimeout(this._showPlayerListByTabName.bind(this),1);
            this._setCounters();
            return this;
        }
    });
    return UserListView;
});