define(['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs'],
    function(_, Backbone, tplMain, tplMsg) {
        'use strict';
        var pub = [
            {
                user: {
                    userId: 1,
                    userName: 'viteck'
                },
                msg: {
                    msgId: 1,
                    msgText: 'Привет ребята!!',
                    time: '5:45'
                }
            },
            {
                user: {
                    userId: 55555555555,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 52,
                    msgText: '50 cent!'
                }
            },
            {
                user: {
                    userId: 10,
                    userName: 'fan'
                },
                msg: {
                    msgId: 498,
                    msgText: 'hi, fifty!!!'
                }
            },
            {
                user: {
                    userId: 15646,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 12,
                    msgText: 'fuck you'
                }
            }
        ];
        var priv = [
            {
                user: {
                    userId: 1,
                    userName: 'viteck'
                },
                msg: {
                    msgId: 1,
                    msgText: 'Привет!',
                    time: '5:46'
                }
            },
            {
                user: {
                    userId: 55555555555,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 52,
                    msgText: 'yoyoyo!'
                }
            }
        ];
        var TEST_DATA = {
            pub: pub,
            priv: priv
        };

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            events: {
                'click .chatMsg': '_deleteMsg',
                'click .tab': 'clickTab'
            },
            clickTab: function(e) {
                var $target = $(e.target),
                    tabName = $target.attr('data-type');

                if (tabName === this.currentActiveTabName) {
                    return;
                }

                this.currentActiveTabName = tabName;
                this._setActiveTab(this.currentActiveTabName);

                this._addAllMsgs(this.currentActiveTabName === 'public'? TEST_DATA.pub: TEST_DATA.priv);
            },
            invitePlayer: function(e) {
            },
            initialize: function(_client) {
                this.$el.html(this.tplMain());

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.ACTIVE_TAB_CLASS = 'activeTab';

                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');

                this.currentActiveTabName = 'public';
                this._setActiveTab(this.currentActiveTabName);

                $('body').append(this.el);
                this._addAllMsgs(TEST_DATA.pub);
                //this._setLoadingState();

                window.view = this;
            },
            _setActiveTab: function(tabName) {
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
            },
            render: function() {
                return this;
            },
            _deleteMsg: function(e) {
                // delete by id or as click .delete handler
                var $msg, msgId;

                if (!isNaN(+e) && typeof +e === 'number') {
                    msgId = e;
                } else {
                    //клик не по кнопке удалить
                    if (!$(e.target).hasClass(this.CLASS_DELETE_CHAT_MESSAGE)) {
                        return;
                    }

                    $msg = $(e.currentTarget);
                    msgId = $msg.attr('data-msgId')
                }

                // если был передан id сообщения
                if (!$msg) {
                    $msg = this.$el.find('li[data-msgId="' + msgId + '"]').remove();
                }

                if (!$msg) {
                    console.warn('cannot find msg with  id', msgId, e);
                    return;
                }

                $msg.remove();
            },
            _addAllMsgs: function(msgs) {
                this.$msgsList.empty();
                _.each(msgs, function(msg) {
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