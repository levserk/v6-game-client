define(['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs'],
    function(_, Backbone, tplMain, tplMsg) {
        'use strict';
        var TEST_DATA = [
            {
                user: {
                    userId: 1,
                    userName: 'viteck'
                },
                msg: {
                    msgId: 1,
                    msgText: 'sex drugs rock!'
                }
            },
            {
                user: {
                    userId: 1,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 1,
                    msgText: '50 cent!'
                }
            },
            {
                user: {
                    userId: 1,
                    userName: 'fan'
                },
                msg: {
                    msgId: 1,
                    msgText: 'hi, fifty!!!'
                }
            },
            {
                user: {
                    userId: 1,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 1,
                    msgText: 'fuck you'
                }
            }
        ];
        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            events: {
            },
            clickTab: function(e) {
            },
            invitePlayer: function(e) {
            },
            initialize: function(_client) {
                this.$el.html(this.tplMain());

                this.CLASS_DISABLED = 'disabled';
                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');

                $('body').append(this.el);
                debugger;
                this._addAllMsgs();
                this._setLoadingState();

                window.view = this;
            },
            _setActiveTab: function(tabName) {
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
            },
            render: function() {
                return this;
            },
            _addAllMsgs: function(msgs) {
                _.each(TEST_DATA, function(msg) {
                    this._addOneMsg(msg);
                }, this);
            },
            _addOneMsg: function(msg) {
                var $msg = this.tplMsg(msg);
                this.$msgsList.append($msg);
            },
            _setLoadingState: function() {
                this.$msgsList.prepend(this.$spinnerWrap);
                this.$messagesWrap.addClass(this.CLASS_DISABLED);
            },
            _removeLoadingState: function() {
                this.$spinnerWrap.remove();
                this.$messagesWrap.removeClass(this.CLASS_DISABLED);
            }
        });
        return ChatView;
    });