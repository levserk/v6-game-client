define(['views/user_list', 'views/dialogs', 'views/chat', 'views/settings', 'views/buttons_panel'],
    function(userListView, dialogsView, v6ChatView, v6SettingsView, v6ButtonsView) {
    var ViewsManager = function(client){
        this.client = client;
        this.userListView = null;
        this.dialogsView = dialogsView;
        this.chat = null;

        client.on('disconnected', function () {
            this.closeAll();
        }.bind(this));
    };

    ViewsManager.prototype.init = function() {
        this.userListView = new userListView(this.client);
        this.dialogsView.init(this.client);
        this.v6ChatView = new v6ChatView(this.client);
        this.settingsView = new v6SettingsView(this.client);
        if (this.client.vkEnable) this.userListView.addInviteFriendButton();
        if (this.client.conf.showButtonsPanel) this.showButtonPanel();
    };

    ViewsManager.prototype.closeAll = function(){
        this.client.ratingManager.close();
        this.client.historyManager.close();
        if (!this.settingsView.isClosed) this.settingsView.save();
    };

    ViewsManager.prototype.showSettings = function () {
        if (!this.client.isLogin) return;
        this.settingsView.show();
    };

    ViewsManager.prototype.showButtonPanel = function() {
        this.client.opts.showButtonsPanel = true;
        this.buttonsView = new v6ButtonsView(this.client);
        this.userListView.$el.append(this.buttonsView.$el);
    };


    ViewsManager.prototype.showUserProfile = function (userId, userName) {
        if (!this.$profileDiv) {
            this.$profileDiv = $('<div id="v6-profileDiv">');
        }
        this.$profileDiv.addClass('v6-block-border');
        this.$profileDiv.empty();
        this.$profileDiv.append('<img  class="closeIcon" src="' + this.client.opts.images.close +  '">');
        this.$profileDiv.append("<div class='stats-area-wrapper'></div>");
        this.$profileDiv.find(".stats-area-wrapper").append("<h4 style='color: #444;font-size: 10pt;padding-left: 5px; text-align: center;'>" + userName + "</h4>");
        this.closeAll();
        if (window.LogicGame && window.LogicGame.hidePanels && window.ui) {
            this.$profileDiv.find('img').click(function () {
                window.LogicGame.hidePanels();
            });
            $.post("/gw/profile/loadProfile.php", {
                sessionId: window._sessionId,
                userId: window._userId,
                playerId: userId
            }, function (data) {
                window.LogicGame.hidePanels();
                var pData = JSON.parse(data);
                if (!pData.profile.playerName) {
                    console.warn('bad profile', pData.profile);
                    return;
                }
                this.$profileDiv.find(".stats-area-wrapper").append(window.ui.userProfile.renderProfile(pData.profile));
                showProfile.bind(this)();
                window.ui.userProfile.bindActions(pData.profile);
            }.bind(this))
        } else {
            this.$profileDiv.find('img').click(function () {
                $(this.$profileDiv).hide();
            }.bind(this));
            showProfile.bind(this)();
        }

        function showProfile() {
            if (this.client.opts.blocks.profileId) {
                $('#'+ this.client.opts.blocks.profileId).append(this.$profileDiv);
            } else {
                $('body').append(this.$profileDiv);
            }
            this.client.historyManager.getProfileHistory(null, userId, 'v6-profileDiv');
            this.showPanel(this.$profileDiv);
        }
    };


    ViewsManager.prototype.showPanel = function ($panel) {
    // try use logic game show panel, auto hide others, opened the same
        try{
            if (window.ui && window.ui.showPanel) {
                window.ui.showPanel({id: $panel.attr('id')})
            } else{
                $panel.show();
            }
        } catch (e){
            console.error('views_manager;', 'show_panel', e);
        }
        $('html, body').animate({
            scrollTop: $panel.offset().top - 350
        }, 500);
    };

    return ViewsManager;
});