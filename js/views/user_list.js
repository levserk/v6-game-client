var UserListView = Backbone.View.extend({
    tpl: _.template($('#userListTpl').html()),
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
        this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
        this.ACTIVE_TAB_CLASS = 'activeTab';
        this.$listWrapper = this.$el.find('.tableWrap');
        this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
        this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');
        this.listenTo(client.userList, 'new_user', this.render.bind(this));
        this.listenTo(client.userList, 'leave_user', this.render.bind(this));
        this.listenTo(client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));

        this.currentActiveTabName = 'free';
        this._setActiveTab(this.currentActiveTabName);
    },
    _setActiveTab: function(tabName) {
        this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
        this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
    },
    _setCounters: function() {
        // TODO
        this.$counterFree.html('(' + client.userList.getUsers().length + ')');
    },
    _showPlayerListByTabName: function(tabName) {
        // default
        if (tabName === undefined) {
            tabName = this.currentActiveTabName;
        }

        if (tabName === 'free') {
            this.$listWrapper.html(this.tpl({
                users: client.userList.getUsers()
            }));
        }
        else if (tabName === 'inGame') {
            this.$listWrapper.html('Нет игроков с такими параметрами')
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