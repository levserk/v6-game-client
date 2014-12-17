define(['underscore', 'backbone', 'jquery',
        'text!tpls/userListFree.ejs', 'text!tpls/userListInGame.ejs', 'text!tpls/userListMain.ejs'
], function(_, Backbone, $, tplFree, tplInGame, tplMain) {
    'use strict';
    var UserListView = Backbone.View.extend({
        tagName: 'div',
        id: 'userList',
        tplFree: _.template(tplFree),
        tplInGame: _.template(tplInGame),
        tplMain: _.template(tplMain),
        events: {
            'click .inviteBtn': 'invitePlayer',
            'click .tabs div': 'clickTab'
        },
        clickTab: function(e) {
            var target = $(e.currentTarget),
                clickedTabName = target.attr('data-type');

            if (clickedTabName === this.currentActiveTabName) {
                return;
            }

            this.currentActiveTabName = clickedTabName;
            this._setActiveTab(this.currentActiveTabName);
            this._showPlayerListByTabName(this.currentActiveTabName);
        },
        invitePlayer: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');


            if (target.hasClass(this.ACTIVE_INVITE_CLASS)) {
                // cancel invite
                client.inviteManager.cancel();
                target.removeClass(this.ACTIVE_INVITE_CLASS);
                target.html('Пригласить');
            } else {
                // send invite
                this.$el.find('.' + this.ACTIVE_INVITE_CLASS).html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
                client.inviteManager.sendInvite(userId, {});
                target.addClass(this.ACTIVE_INVITE_CLASS);
                target.html('Отмена');
            }

            console.log('invite user', userId);
        },
        initialize: function() {
            /*
             tabType: {'free', 'inGame'}
             */
            this.$el.html(this.tplMain());
            $('body').append(this.el);

            this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
            this.ACTIVE_TAB_CLASS = 'activeTab';

            this.$list = this.$el.find('.tableWrap table');
            this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
            this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');

            this.listenTo(client.userList, 'new_user', this.render.bind(this));
            this.listenTo(client.userList, 'leave_user', this.render.bind(this));
            this.listenTo(client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
            this.listenTo(client.userList, 'new_room', this.render.bind(this));
            this.listenTo(client.userList, 'close_room', this.render.bind(this));

            this.currentActiveTabName = 'free';
            this._setActiveTab(this.currentActiveTabName);
        },
        _setActiveTab: function(tabName) {
            this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
            this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
        },
        _setCounters: function() {
            // TODO
            this.$counterFree.html('(' + client.userList.getUserList().length + ')');
            this.$counterinGame.html('(' + client.userList.getRoomList().length * 2 + ')');
        },
        _showPlayerListByTabName: function(tabName) {
            // default
            if (tabName === undefined) {
                tabName = this.currentActiveTabName;
            }

            if (tabName === 'free') {
                this.$list.html(this.tplFree({
                    users: client.userList.getUserList()
                }));
            }
            else if (tabName === 'inGame') {
                this.$list.html(this.tplInGame({
                    rooms: client.userList.getRoomList()
                }));
            } else {
                console.warn('unknown tab', tabName);
            }
        },
        onRejectInvite: function(invite) {
            this.$el.find('.' + this.ACTIVE_INVITE_CLASS + '[data-userId="' + invite.user.userId + '"]').html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
        },
        render: function() {
            this._showPlayerListByTabName();
            this._setCounters();
            return this;
        }
    });
    return UserListView;
});