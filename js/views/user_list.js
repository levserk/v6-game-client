var UserListView = Backbone.View.extend({
    tpl: _.template($('#userListTpl').html()),
    events: {
        'click .inviteBtn': 'invitePlayer'
    },
    invitePlayer: function(e) {
        var userId = $(e.currentTarget).attr('data-userId');
        console.log('invite user', userId);
    },
    initialize: function() {
        this.listenTo(client.userList, 'new_user', this.render.bind(this));
        this.listenTo(client.userList, 'leave_user', this.render.bind(this));
    },
    render: function() {
        this.$el.html(this.tpl({
            users: client.userList.users
        }));
        return this;
    }
});