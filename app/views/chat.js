define(['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs', 'text!tpls/v6-chatDay.ejs'],
    function(_, Backbone, tplMain, tplMsg, tplDay) {
        'use strict';

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            tplDay: _.template(tplDay),
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
                // e используется здесь только если нажат enter
                if (e.type === 'keyup' && e.keyCode !== 13) {
                    return;
                }

                if (this.$inputMsg.has(this.$placeHolderSpan).length) {
                    return;
                }

                this._sendMsg(this.$inputMsg.text());
            },
            scrollEvent: function() {
                if (this.$messagesWrap.scrollTop()<5 && this.client.chatManager.loading){
                    this._setLoadingState();
                    this.client.chatManager.loadMessages();
                }
            },
            _sendMsg: function(text) {
                if (text === '' || typeof text !== 'string') {
                    return;
                }

                if (text.length > this.MAX_MSG_LENGTH) {
                    alert(this.MAX_LENGTH_MSG);
                    return;
                }
                this.client.chatManager.sendMessage(text, null, $('#chatIsAdmin')[0].checked);
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
                this.SCROLL_VAL = 40;
                this.MAX_LENGTH_MSG = 'Сообщение слишком длинное (максимальная длина - 128 символов). Сократите его попробуйте снова';

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_CHATADMIN = 'chatAdmin';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.CLASS_NEW_MSG = 'newMsg';
                this.CLASS_ADMIN_MSG = 'isAdmin';
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

                this.$inputMsg.empty().append(this.$placeHolderSpan);
                //this._setLoadingState();
                if (window.LogicGame && window.LogicGame.isSuperUser()) this.$el.find('.' + this.CLASS_CHATADMIN).removeClass(this.CLASS_CHATADMIN);

                this.listenTo(this.client.chatManager, 'message', this._addOneMsg.bind(this));
                this.listenTo(this.client.chatManager, 'load', this._preaddMsgs.bind(this));
                this.$messagesWrap.scroll(this.scrollEvent.bind(this));
                this._setLoadingState();
            },
            _setActiveTab: function(tabName) {
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
            },
            render: function() {
                return this;
            },
            _deleteMsg: function(e) {
                var $msg, msgId;
                if (!isNaN(+e) && typeof +e === 'number') {
                    msgId = e;
                } else { //клик не по кнопке удалить
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
            _addOneMsg: function(msg) {
                console.log('chat message', msg);
                var $msg = this.tplMsg({msg:msg});
                var fScroll = this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() - this.$messagesWrap.scrollTop() < this.SCROLL_VAL;

                if (this.client.chatManager.last.d != msg.d) this.$msgsList.append(this.tplDay(msg));

                this.$msgsList.append($msg);

                $msg = this.$el.find('li[data-msgId="' + msg.time + '"]');
                if (msg.admin) $msg.addClass(this.CLASS_ADMIN_MSG);

                $msg.addClass(this.CLASS_NEW_MSG);
                setTimeout(function(){
                    this.$el.find('li[data-msgId="' + msg.time + '"]').removeClass(this.CLASS_NEW_MSG);
                }.bind(this), 2500);

                //scroll down
                if (fScroll) this.$messagesWrap.scrollTop(this.$messagesWrap[0].scrollHeight)
            },
            _preaddMsgs: function(msg) {
                console.log('pre chat message', msg);
                this._removeLoadingState();
                if (!msg) return;
                var oldScrollTop =  this.$messagesWrap.scrollTop();
                var oldScrollHeight = this.$messagesWrap[0].scrollHeight;
                var oldDay = this.$el.find('li[data-day-msgId="' + this.client.chatManager.first.time + '"]');
                if (oldDay) oldDay.remove();
                // add day previous msg
                if (this.client.chatManager.first.d != msg.d) this.$msgsList.prepend(this.tplDay(this.client.chatManager.first));
                var $msg = this.tplMsg({msg: msg});
                this.$msgsList.prepend($msg);
                // add day this, now firs message
                this.$msgsList.prepend(this.tplDay(msg));
                $msg = this.$el.find('li[data-msgId="' + msg.time + '"]');
                if (msg.admin) $msg.addClass(this.CLASS_ADMIN_MSG);
                this.$messagesWrap.scrollTop(oldScrollTop + this.$messagesWrap[0].scrollHeight - oldScrollHeight);
            },
            _setLoadingState: function() {
                this.$msgsList.prepend(this.$spinnerWrap);
                this.$messagesWrap.addClass(this.CLASS_DISABLED);
            },
            _removeLoadingState: function(){
                this.$spinnerWrap.remove();
                this.$messagesWrap.removeClass(this.CLASS_DISABLED);
            }
        });
        return ChatView;
    });