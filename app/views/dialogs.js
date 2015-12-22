define(['underscore', 'text!tpls/v6-dialogRoundResult.ejs'], function(_, tplRoundResultStr) {
    'use strict';
    var dialogs = (function() {
        var NOTIFICATION_CLASS = 'dialogNotification';
        var HIDEONCLICK_CLASS = 'dialogClickHide';
        var INVITE_CLASS = 'dialogInvite';
        var GAME_CLASS = 'dialogGame';
        var DRAGGABLE_CLASS = 'dialogDraggable';
        var ROUNDRESULT_CLASS = 'dialogRoundResult';
        var TAKEBACK_CLASS = 'dialogTakeBack';
        var ACTION_CLASS = 'dialogGameAction';
        var BTN_PLAYAGANIN_CLASS = 'btnPlayAgain';
        var BTN_LEAVEGAME_CLASS = 'btnLeaveGame';
        var BTN_LEAVEGAMEOK_CLASS = 'btnLeaveGameOk';
        var client;
        var locale;
        var roundResultInterval, roundResultStartTime;
        var tplRoundResult = _.template(tplRoundResultStr);
        var dialogTimeout;
        var inviteTimeout = 30;
        var tplInvite = '';

        function _subscribe(_client) {
            client = _client;
            locale = client.locale['dialogs'];
            client.inviteManager.on('new_invite', newInvite);
            client.inviteManager.on('reject_invite', rejectInvite);
            client.inviteManager.on('cancel_invite', cancelInvite);
            client.inviteManager.on('remove_invite', removeInvite);
            client.gameManager.on('user_leave', userLeave);
            client.gameManager.on('turn', userTurn);
            client.gameManager.on('game_start', hideDialogs);
            client.gameManager.on('round_start', onRoundStart);
            client.gameManager.on('round_end', roundEnd);
            client.gameManager.on('game_leave', leaveGame);
            client.gameManager.on('ask_draw', askDraw);
            client.gameManager.on('cancel_draw', cancelDraw);
            client.gameManager.on('ask_back', askTakeBack);
            client.gameManager.on('cancel_back', cancelTakeBack);
            client.chatManager.on('show_ban', showBan);
            client.on('login_error', loginError);
            client.on('disconnected', onDisconnect);
            $(document).on("click", hideOnClick);
            inviteTimeout = client.inviteManager.inviteTimeoutTime;
            tplInvite = '<div class="inviteTime">'+locale['inviteTime']+'<span>'+inviteTimeout+'</span>'+locale['seconds']+'</div>';
        }

        function newInvite(invite) {
            var html = locale.invite + ' <b>' + invite.from.userName + '</b>';
            if (typeof this.client.opts.generateInviteText == "function")
                html = this.client.opts.generateInviteText(invite);
                html += tplInvite;
            var div = showDialog(html, {
                buttons: {
                    "Принять": { text: locale['accept'], click: function() {
                            clearInterval(invite.data.timeInterval);
                            client.inviteManager.accept($(this).attr('data-userId'));
                            $(this).remove();
                        }
                    },
                    "Отклонить": { text: locale['decline'], click: function() {
                            clearInterval(invite.data.timeInterval);
                            client.inviteManager.reject($(this).attr('data-userId'));
                            $(this).remove();
                        }
                    }
                },
                close: function() {
                    clearInterval(invite.data.timeInterval);
                    client.inviteManager.reject($(this).attr('data-userId'));
                    $(this).remove();
                }
            }, true, false, false);
            div.attr('data-userId', invite.from.userId);
            div.addClass(INVITE_CLASS);
            invite.data.startTime = Date.now();
            invite.data.timeInterval = setInterval(function(){
                var time = (inviteTimeout * 1000 - (Date.now() - invite.data.startTime)) / 1000 ^0;
                this.find('.inviteTime span').html(time);
                if (time < 1) this.dialog('close');
            }.bind(div), 250);
        }

        function rejectInvite(invite) {
            console.log('dialogs; rejectInvite invite', invite);
            var html = locale.user + ' <b>' + invite.user.userName + '</b>';
            if (invite.reason != 'timeout')
                html += locale['rejectInvite'];
            else html += locale['timeoutInvite'] + inviteTimeout + locale['seconds'];
            var div = showDialog(html, {}, true, true, true);
        }

        function cancelInvite(invite) {
            console.log('dialogs; cancel invite', invite);
            clearInterval(invite.timeInterval);
        }

        function removeInvite(invite) {
            console.log('dialogs; removeInvite invite', invite);
            var userId = invite.from;
            $('.' + INVITE_CLASS + '[data-userId="' + userId + '"]').remove();
            clearInterval(invite.timeInterval);
        }

        function askDraw(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = locale['user'] + ' <b>' + user.userName + '</b>' + locale['askDraw'];
            var div = showDialog(html,{
                position: true,
                buttons: {
                    "Принять": { text: locale['accept'], click: function() {
                            client.gameManager.acceptDraw();
                            $(this).remove();
                        }
                    },
                    "Отклонить": { text: locale['decline'], click: function() {
                            client.gameManager.cancelDraw();
                            $(this).remove();
                        }
                    }
                },
                close: function() {
                    client.gameManager.cancelDraw();
                    $(this).remove();
                }
            }, true, true, false);
            div.addClass(GAME_CLASS);
        }

        function cancelDraw(user) {
            var html = locale['user'] + ' <b>' + user.userName + '</b> ' + locale['cancelDraw'];
            var div = showDialog(html, {position: true}, true, true, true);
        }

        function askTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = locale['user'] + ' <b>' + user.userName + '</b> ' + locale['askTakeBack'];
            var div = showDialog(html,{
                position: true,
                buttons: {
                    "Да": { text: locale['yes'], click: function() {
                            client.gameManager.acceptTakeBack();
                            $(this).remove();
                        }
                    },
                    "Нет": { text: locale['no'], click: function() {
                            client.gameManager.cancelTakeBack();
                            $(this).remove();
                        }
                    }
                },
                close: function() {
                    client.gameManager.cancelTakeBack();
                    $(this).remove();
                }
            }, true, true, false);
            div.addClass(TAKEBACK_CLASS);
            div.addClass(GAME_CLASS);
        }

        function cancelTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = locale['user'] + ' <b>' + user.userName + '</b>' + locale['cancelTakeBack'];
            var div = showDialog(html, {position: true}, true, true, true);
        }

        function roundEnd(data) {
            if (!data.isPlayer) {
                return;
            }
            var oldElo = +client.getPlayer()[data.mode].ratingElo;
            var oldRank = +client.getPlayer()[data.mode].rank;
            var newElo = +data['ratings'][client.getPlayer().userId].ratingElo;
            var newRank = +data['ratings'][client.getPlayer().userId].rank;
            var eloDif = newElo - oldElo,
                vkPost = false,
                vkText = '';
            console.log('round_end;', data, oldElo, newElo, oldRank, newRank);
            hideDialogs();
            var result = locale['gameOver'], rankResult = '';
            if (data.save) {
                switch (data.result) {
                    case 'win':
                        result = locale['win'];
                        break;
                    case 'lose':
                        result = locale['lose'];
                        break;
                    case 'draw':
                        result = locale['draw'];
                        break;
                }
                result += '<b> (' + (eloDif >= 0 ? '+' : '') + eloDif + ' ' + locale['scores'] + ') </b>';
            }
            switch (data.action){
                case 'timeout': result += ' ' + (data.result == 'win' ? locale['opponentTimeout'] : locale['playerTimeout']);
                    break;
                case 'throw': result += ' ' + (data.result == 'win' ? locale['opponentThrow'] : locale['playerThrow']);
                    break;
            }
            if (newRank > 0 && data.save) {
                if (data.result == 'win' && oldRank > 0 && newRank < oldRank) {
                    rankResult = locale['ratingUp'] + oldRank + locale['on'] + newRank + locale['place'] + '.';
                } else rankResult = locale['ratingPlace'] + newRank + locale['place'] + '.';
            }
            // check vk post
            if (this.client.vkWallPost) {
                if (client.getPlayer()[data.mode].win == 0 && data['ratings'][client.getPlayer().userId].win == 1){
                    vkPost = true;
                    vkText = 'Моя первая победа';
                } else if (data.result == 'win' && oldRank > 0 && newRank < oldRank){
                    vkPost = true;
                    vkText = 'Я занимаю ' + newRank + ' место в рейтинге';
                }
            }
            var html = tplRoundResult({
                result: result, rankResult: rankResult, vkPost: vkPost, locale: locale
            });
            var div = showDialog(html, {
                position: true,
                width: 350,
                buttons: {
                    "Да, начать новую игру": {
                        text: locale['playAgain'],
                        'class': BTN_PLAYAGANIN_CLASS,
                        click: function () {
                            console.log('result yes');
                            client.gameManager.sendReady();
                            div.parent().find(':button').hide();
                            div.parent().find(":button."+BTN_LEAVEGAME_CLASS).show();
                            div.find('.'+ACTION_CLASS).html(locale['waitingOpponent']);
                        }
                    },
                    "Нет, выйти": {
                        text: locale['leave'],
                        'class': BTN_LEAVEGAME_CLASS,
                        click: function () {
                            console.log('result no');
                            clearInterval(roundResultInterval);
                            $(this).remove();
                            client.gameManager.leaveGame();
                        }
                    },
                    "Ок" : {
                        text: 'Ок',
                        'class': BTN_LEAVEGAMEOK_CLASS,
                        click: function() {
                            console.log('result ok');
                            clearInterval(roundResultInterval);
                            $(this).remove();
                            client.gameManager.leaveGame();
                        }
                    }
                },
                close: function () {
                    console.log('result close');
                    clearInterval(roundResultInterval);
                    $(this).remove();
                    client.gameManager.leaveGame();
                }
            }, true, false);

            div.addClass(ROUNDRESULT_CLASS);
            div.parent().find(":button."+BTN_LEAVEGAMEOK_CLASS).hide();
            // show dialog result with delay
            div.parent().hide();
            dialogTimeout = setTimeout(function(){
                div.parent().show();
                this.client.soundManager._playSound(data.result);
            }.bind(this), data.action == 'user_leave' ? 1000 : client.opts.resultDialogDelay);
            div.addClass(GAME_CLASS);

            // add timer to auto close
            roundResultStartTime = Date.now();
            roundResultInterval = setInterval(function(){
                var time = (inviteTimeout * 2000 - (Date.now() - roundResultStartTime)) / 1000 ^0;
                this.find('.roundResultTime span').html(time);
                if (time < 1) {
                    console.log('interval', time);
                    clearInterval(roundResultInterval);
                    this.find('.roundResultTime').hide();
                    this.find('.'+ACTION_CLASS).html(locale['waitingTimeout']);
                    div.parent().find(':button').hide();
                    div.parent().find(":button."+BTN_LEAVEGAMEOK_CLASS).show();
                    div.removeClass(GAME_CLASS);
                    client.gameManager.leaveGame();
                }
            }.bind(div), 250);

            if (vkPost) {
                div.find('.vkWallPost').on('click', function(){
                    this.client.vkWallPostResult(vkText);
                }.bind(this))
            }
        }

        function userLeave(user) {
            hideNotification();
            var html = locale['user'] + ' <b>' + user.userName + '</b> ' + locale['opponentLeave'];
            var div = $('.'+ROUNDRESULT_CLASS);
            if (div && div.length>0){   // find round result dialog and update it
                div.parent().find(':button').hide();
                div.parent().find(":button."+BTN_LEAVEGAMEOK_CLASS).show();
                div.find('.'+ACTION_CLASS).html(html);
                clearInterval(roundResultInterval);
                div.find('.roundResultTime').hide();
            } else {
                div = showDialog(html, {
                    position: true,
                    buttons: {
                        "Ок": function() {
                            $(this).remove();
                            client.gameManager.leaveRoom();
                        }
                    },
                    close: function() {
                        client.gameManager.leaveRoom();
                        $(this).remove();
                    }
                }, true, true, true);
            }
            div.addClass(GAME_CLASS);
        }

        function loginError() {
            var html = locale['loginError'];
            var div = showDialog(html, {}, false, false, false);
        }

        function showBan(ban) {
            var html = locale['banMessage'];
            if (ban.reason && ban.reason != '') html += 'за ' + ban.reason;
            else html += locale['banReason'];
            if (ban.timeEnd) {
                html += (ban.timeEnd > 2280000000000 ? ' навсегда' : ' до ' + formatDate(ban.timeEnd));
            }
            var div = showDialog(html, {}, false, false, false);
        }

        function leaveGame() {
            hideNotification();
            hideGameMessages();
        }

        function userTurn() {
            $('.' + TAKEBACK_CLASS).dialog("close");
        }

        function showDialog(html, options, draggable, notification, clickHide) {
            options = options || {};
            options.resizable = options.resizable || false;
            options.modal = options.modal || false;
            options.draggable = options.draggable || false;
            options.buttons = options.buttons || {
                "Ок": function() {
                    $(this).remove();
                }
            };
            options.draggable = options.draggable || draggable;
            notification = notification || options.notification;
            clickHide = clickHide || options.clickHide;
            if (options.position === true) {
                var field = document.getElementById('game-field') || document.getElementById('field') || document;
                options.position = {my: 'top', at: 'top', of: field}
            }

            var div = $('<div>');
            var prevFocus = document.activeElement || document;
            div.html(html).dialog(options);
            div.parent().find(':button').attr('tabindex', '-1');
            if (document.activeElement != null){
                document.activeElement.blur();
            }
            $(prevFocus).focus();
            if (notification) {
                div.addClass(NOTIFICATION_CLASS);
            }
            if (clickHide) {
                div.addClass(HIDEONCLICK_CLASS);
            }
            return div;
        }


        function onRoundStart() {
            clearInterval(roundResultInterval);
            $('.' + ROUNDRESULT_CLASS).remove();
        }


        function hideDialogs() {
            $('.' + NOTIFICATION_CLASS).dialog("close");
            $('.' + INVITE_CLASS).dialog("close");
            clearTimeout(dialogTimeout);
            clearInterval(roundResultInterval);
        }

        function hideNotification() {
            $('.' + NOTIFICATION_CLASS).dialog("close");
        }

        function hideGameMessages() {
            $('.' + GAME_CLASS).dialog("close");
        }

        function hideOnClick() {
            $('.' + HIDEONCLICK_CLASS).dialog("close");
        }

        function formatDate(time) {
            var date = new Date(time);
            var day = date.getDate();
            var month = date.getMonth() + 1;
            var year = ("" + date.getFullYear()).substr(2, 2);
            return ext(day, 2, "0") + "." + ext(month, 2, "0") + "."  + year;
            function ext(str, len, char) {
                //char = typeof (char) == "undefined" ? "&nbsp;" : char;
                str = "" + str;
                while (str.length < len) {
                    str = char + str;
                }
                return str;
            }
        }

        function onDisconnect() {
            hideDialogs();
            $('.' + ROUNDRESULT_CLASS).remove();
        }

        return {
            init: _subscribe,
            showDialog: showDialog,
            hideDialogs: hideDialogs,
            hideNotification: hideNotification,
            cancelTakeBack: function(){
                $('.' + TAKEBACK_CLASS).dialog("close");
            }
        };
    }());
    return dialogs;
});
