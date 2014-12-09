var UserListView = Backbone.View.extend({
    tpl: _.template($('#userListTpl').html()),
    events: {
        'click .inviteBtn': 'invitePlayer'
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
        this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
        this.listenTo(client.userList, 'new_user', this.render.bind(this));
        this.listenTo(client.userList, 'leave_user', this.render.bind(this));
        this.listenTo(client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
    },
    onRejectInvite: function(invite) {
        this.$el.find('.' + this.ACTIVE_INVITE_CLASS + '[data-userId="' + invite.user.userId + '"]').html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
    },
    render: function() {
        this.$el.find('.tableWrap').html(this.tpl({
            users: client.userList.getUsers()
        }));
        return this;
    }
});