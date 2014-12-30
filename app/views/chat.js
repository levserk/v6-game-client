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
                    msgText: '50 cent!',
                    time: '15:40'
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
                    msgText: '<div>hack you!</div>!'
                }
            }
        ];
        var TEST_DATA = {
            pub: [],
            priv: []
        };

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            events: {
                'click .chatMsg': '_deleteMsg',
                'click .tab': 'clickTab',
                'blur .inputMsg': 'blurInputMsg',
                'click .inputMsg': 'clickInputMsg',
                'click .sendMsgBtn': 'sendMsgEvent',
                'keyup .inputMsg': 'sendMsgEvent',
                'change #chat-select': 'changeChatSelect'
            },
            changeChatSelect: function(e) {
                var textMsg = e.target.options[e.target.selectedIndex].innerHTML;
                this.$SELECTED_OPTION.attr('selected', true);
                this.$inputMsg.text(textMsg);
            },
            sendMsgEvent: function(e) {
                var msgText = '';
                console.log("TEST FIRE", e.type);
                // e используется здесь только если нажат enter

                if (e.type === 'keyup' && e.keyCode !== 13) {
                    return;
                }

                if (this.$inputMsg.has(this.$placeHolderSpan).length) {
                    return;
                }

                msgText = this.$inputMsg.text();
                this._sendMsg(msgText);
            },
            _sendMsg: function(text) {
                if (text === '' || typeof text !== 'string') {
                    return;
                }

                console.log('now check');
                if (text.length > this.MAX_MSG_LENGTH) {
                    alert(this.MAX_LENGTH_MSG);
                    return;
                }

                this._addOneMsg({
                    user: {
                        userName: this.client.getPlayer().userName,
                        userId: 665
                    },
                    msg: {
                        msgText: text,
                        msgId: 3,
                        time: _getTime()
                    }
                });

                this._onMsgAdded();
            },
            _onMsgAdded: function() {
                this.$messagesWrap.scrollTop(this.$messagesWrap[0].scrollHeight);
                this.$inputMsg.empty();
                this.$inputMsg.focus();
            },
            blurInputMsg: function(e) {
                var target = $(e.currentTarget);

                if (target.text() === '') {
                    target.empty().append(this.$placeHolderSpan); // empty на всякий случай
                }
            },
            clickInputMsg: function(e) {
                var target = $(e.currentTarget);

                if (target.has(this.$placeHolderSpan).length) {
                    target.empty();
                }
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
                this.client = _client;
                this.$el.html(this.tplMain());

                this.MAX_MSG_LENGTH = 128;
                this.MAX_LENGTH_MSG = 'Сообщение слишком длинное (максимальная длина - 128 символов). Сократите его попробуйте снова';

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_CHATADMIN = 'chatAdmin';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.ACTIVE_TAB_CLASS = 'activeTab';

                this.$placeHolderSpan = $('<span class="placeHolderSpan">Введите ваше сообщение..</span>');

                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');
                this.$inputMsg = this.$el.find('.inputMsg');
                this.$SELECTED_OPTION = this.$el.find('select option:selected');

                this.currentActiveTabName = 'public';
                this._setActiveTab(this.currentActiveTabName);

                $('body').append(this.el);
                this._addAllMsgs(TEST_DATA.pub);

                this.$inputMsg.empty().append(this.$placeHolderSpan);
                //this._setLoadingState();
                if (window.LogicGame && window.LogicGame.isSuperUser()) this.$el.find('.' + this.CLASS_CHATADMIN).removeClass(this.CLASS_CHATADMIN);
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

        //TODO use momentjs
        function _getTime(){
            var d = new Date();
            var h = d.getHours();
            var m = d.getMinutes();
            if (h < 10) h = '0' + h;
            if (m < 10) m = '0' + m;
            return h + ':' + m;
        }
    });