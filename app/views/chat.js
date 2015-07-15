define(['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs', 'text!tpls/v6-chatDay.ejs', 'text!tpls/v6-chatRules.ejs', 'text!tpls/v6-chatBan.ejs'],
    function(_, Backbone, tplMain, tplMsg, tplDay, tplRules, tplBan) {
        'use strict';

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            tplDay: _.template(tplDay),
            tplRules: _.template(tplRules),
            tplBan: _.template(tplBan),
            events: {
                'click .chatMsg': '_deleteMsg',
                'click .tab': 'clickTab',
                'blur .inputMsg': 'blurInputMsg',
                'focus .inputMsg': 'clickInputMsg',
                'click .sendMsgBtn': 'sendMsgEvent',
                'keyup .inputMsg': 'sendMsgEvent',
                'change #chat-select': 'changeChatSelect',
                'click .chatMsg div[data-userid]': 'showMenu',
                'click li[data-action]': 'clickDialogAction',
                'click .chatRules': 'showChatRules'
            },

            banUser: function(userId, userName){
                var mng =  this.manager;
                var div = $(this.tplBan({userName: userName})).attr('data-userId', userId).dialog({
                    buttons: {
                        "Добавить в бан": function() {
                           mng.banUser($(this).attr('data-userId'),$(this).find('#ban-duration')[0].value, $(this).find('#ban-reason').html());
                            $(this).remove();
                        },
                        "Отмена": function(){
                            $(this).remove();
                        }
                    },
                    close: function() {
                        $(this).remove();
                    }
                }).parent().draggable();
            },

            answerUser: function(userId, userName){
                var text = this.$inputMsg.text();
                console.log('answer', userName, text);
                if (this.$inputMsg.has(this.$placeHolderSpan).length) {
                   text = ' ';
                }
                if (text.indexOf(userName+',') != -1){
                    return;
                }
                this.$inputMsg.text(userName+ ', '+ text);
                this.$inputMsg.focus();
                // cursor to end
                if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
                    var range = document.createRange();
                    range.selectNodeContents(this.$inputMsg[0]);
                    range.collapse(false);
                    var sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                } else if (typeof document.body.createTextRange != "undefined") {
                    var textRange = document.body.createTextRange();
                    textRange.moveToElementText(this.$inputMsg[0]);
                    textRange.collapse(false);
                    textRange.select();
                }
            },

            showChatRules: function() {
                this.$rules.css({
                    top: ($(window).height() / 2) - (this.$rules.outerHeight() / 2),
                    left: ($(window).width() / 2) - (this.$rules.outerWidth() / 2)
                }).show();
            },

            clickDialogAction: function(e) {
                var actionObj = {
                    action: $(e.currentTarget).attr('data-action'),
                    userId: this.$menu.attr('data-userId'),
                    userName: this.$menu.attr('data-userName')
                };

                switch (actionObj.action){
                    case 'showProfile': this.client.onShowProfile(actionObj.userId, actionObj.userName); break;
                    case 'invite': this.client.viewsManager.userListView.invitePlayer(actionObj.userId); break;
                    case 'ban': this.banUser(actionObj.userId, actionObj.userName); break;
                    case 'answer': this.answerUser(actionObj.userId, actionObj.userName); break;
                }
            },

            showMenu: function(e) {
                // клик на window.body сработает раньше, поэтому сдесь даже не нужно вызывать $menu.hide()
                var coords = e.target.getBoundingClientRect(),
                    OFFSET = 20, // отступ, чтобы не закрывало имя
                    userId = $(e.target).parent().attr('data-userid'),
                    userName = $(e.currentTarget).attr('title');

                setTimeout(function() {
                    this.$menu.find('li[data-action=invite]').hide();
                    if (!this.client.gameManager.inGame()) {                // show invite user, if we can
                        var userlist = this.client.userList.getFreeUserList();
                        if (userlist) {                                     // check user is free
                            for (var i = 0; i < userlist.length; i++){
                                if (userlist[i].userId == userId){
                                    this.$menu.find('li[data-action=invite]').show();
                                }
                            }
                        }
                    }

                    this.$menu.attr('data-userId', userId);
                    this.$menu.attr('data-userName', userName);
                    this.$menu.css({
                        left: OFFSET, // фиксированный отступ слева
                        top: coords.top - document.getElementById('v6Chat').getBoundingClientRect().top + OFFSET
                    }).slideDown();
                }.bind(this), 0);

            },

            hideMenuElement: function() {
                this.$menu.removeAttr('data-userId');
                this.$menu.hide();
            },

            changeChatSelect: function(e) {
                var textMsg = e.target.options[e.target.selectedIndex].innerHTML;
                this.$SELECTED_OPTION.attr('selected', true);
                var text = this.$inputMsg.text();
                text = (text.substr(text.length-3, 2) == ', ' ? text : '') + textMsg;
                this.$inputMsg.text(text);
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
                if (this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() != 0 &&
                    this.$messagesWrap.scrollTop()<5 && this.client.isLogin &&
                    !this.manager.fullLoaded[this.manager.current]){
                    this._setLoadingState();
                    this.manager.loadMessages();
                }
            },

            bodyScroll: function (e) {
                e.deltaY =  e.deltaY ||  e.originalEvent.wheelDeltaY || -e.originalEvent.detail;
                if ((this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() - this.$messagesWrap.scrollTop() === 0) && e.deltaY < 0) {
                    e.preventDefault();
                    e.stopPropagation();
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
                this.manager.sendMessage(text, null, this.currentActiveTabName, $('#chatIsAdmin')[0].checked);
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
                this.manager.loadCachedMessages(this.tabs[tabName].target, this.currentActiveTabName);
            },

            initialize: function(_client) {
                this.client = _client;
                this.locale = _client.locale.chat;
                this.manager = _client.chatManager;
                this.images = _client.opts.images;
                this.$el.html(this.tplMain({locale: this.locale}));
                this.$el.addClass('v6-block-border');

                this.MAX_MSG_LENGTH = 128;
                this.SCROLL_VAL = 40;
                this.MAX_LENGTH_MSG = 'Сообщение слишком длинное (максимальная длина - 128 символов). Сократите его попробуйте снова';

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_CHATADMIN = 'chatAdmin';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.CLASS_NEW_MSG = 'newMsg';
                this.CLASS_ADMIN_MSG = 'isAdmin';
                this.ACTIVE_TAB_CLASS = 'activeTab';
                this.CLASS_MENU_ELEMENT = 'menuElement';

                this.$menu = this.$el.find('.' + this.CLASS_MENU_ELEMENT); // диалоговое меню при ЛКМ на имени игрока
                if (!this.client.isAdmin) {
                    this.$menu.find('li[data-action="ban"]').remove();
                }
                window.document.body.addEventListener('click', this.hideMenuElement.bind(this));

                this.$rules = $(this.tplRules({close: this.images.close}));
                window.document.body.appendChild(this.$rules[0]);
                this.$rules.find('img.closeIcon').on('click', function() {
                    this.$rules.hide();
                }.bind(this));

                this.$placeHolderSpan = $('<span class="placeHolderSpan">'+this.locale.inputPlaceholder+'..</span>');

                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner" style="background: url(' + this.images.spin + ');"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');
                this.$inputMsg = this.$el.find('.inputMsg');
                this.$SELECTED_OPTION = this.$el.find('select option:selected');

                this.currentActiveTabName = 'public';
                this.currentActiveTabTitle = _client.game;
                this.tabs = {
                    'public': { target: _client.game, title: this.locale.tabs.main },
                    'private': null,
                    'room': null
                };

                this._setActiveTab(this.currentActiveTabName);
                //append element
                if (_client.opts.blocks.chatId)
                    $('#'+_client.opts.blocks.chatId).append(this.el);
                else
                    $('body').append(this.el);

                this.$inputMsg.empty().append(this.$placeHolderSpan);
                this._setLoadingState();

                if (this.client.isAdmin) this.$el.find('.' + this.CLASS_CHATADMIN).removeClass(this.CLASS_CHATADMIN);

                this.listenTo(this.manager, 'message', this._addOneMsg.bind(this));
                this.listenTo(this.manager, 'load', this._preaddMsgs.bind(this));
                this.listenTo(this.manager, 'open_dialog', this._openDialog.bind(this));
                this.listenTo(this.manager, 'close_dialog', this._closeDialog.bind(this));
                this.$messagesWrap.scroll(this.scrollEvent.bind(this));
                this.$messagesWrap.on({'mousewheel DOMMouseScroll': this.bodyScroll.bind(this)});
            },

            setPublicTab: function(tabName){
                this.tabs.public.target = tabName;
                this.currentActiveTabName = 'public';
                this._setActiveTab('public');
            },

            _setActiveTab: function(tabName) {
                var $tab = this.$el.find('.tabs div[data-type="' + tabName + '"]');
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                $tab.addClass(this.ACTIVE_TAB_CLASS);
                $tab.html(this.tabs[tabName].title);
                $tab.show();

                this.$msgsList.html('');
                this._setLoadingState();
                this.currentActiveTabTitle = this.tabs[tabName].target;
            },

            render: function() {
                return this;
            },

            _openDialog: function(dialog){
                if (dialog.userId) {
                    this.tabs['private'] = {target: dialog.userId, title: dialog.userName};
                    this.currentActiveTabName = 'private';
                    this._setActiveTab('private');
                } else if (dialog.roomId) {
                    this.tabs['room'] = {target: dialog.roomId, title: this.locale.tabs.room};
                    this.currentActiveTabName = 'room';
                    this._setActiveTab('room');
                }

            },

            _closeDialog: function(target){
                this.currentActiveTabName = 'public';
                this._setActiveTab('public');
                this.$el.find('.tabs div[data-type="' + 'private' + '"]').hide();
                this.$el.find('.tabs div[data-type="' + 'room' + '"]').hide();
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
                if (msgId) {
                    this.manager.deleteMessage(parseFloat(msgId));
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
                //console.log('chat message', msg);
                if (msg.target != this.currentActiveTabTitle) return;
                var $msg = this.tplMsg({msg:msg, imgDel:this.images.del});
                var fScroll = this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() - this.$messagesWrap.scrollTop() < this.SCROLL_VAL;

                if (!this.manager.last[msg.target] ||
                    this.manager.last[msg.target].d != msg.d) {
                    this.$msgsList.append(this.tplDay(msg));
                }
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
                //console.log('pre chat message', msg);
                if (msg && msg.target != this.currentActiveTabTitle) return;
                this._removeLoadingState();
                if (!msg) return;
                var oldScrollTop =  this.$messagesWrap.scrollTop();
                var oldScrollHeight = this.$messagesWrap[0].scrollHeight;
                var oldDay = this.$el.find('li[data-day-msgId="' + this.manager.first[msg.target].time + '"]');
                if (oldDay) oldDay.remove();
                // add day previous msg
                if (this.manager.first[msg.target].d != msg.d) {
                    this.$msgsList.prepend(this.tplDay(this.manager.first[msg.target]));
                }
                var $msg = this.tplMsg({msg: msg, imgDel:this.images.del});
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