define(function() {
    'use strict';
    var dialogs = (function() {
        var NOTIFICATION_CLASS = 'dialogNotification';
        var HIDEONCLICK_CLASS = 'dialogClickHide';
        var INVITE_CLASS = 'dialogInvite';
        var DRAGGABLE_CLASS = 'dialogDraggable';
        var USERLEAVE_CLASS = 'dialogUserLeave';
        var ROUNDRESULT_CLASS = 'dialogRoundResult';
        var TAKEBACK_CLASS = 'dialogTakeBack';
        var client;
        var dialogTimeout;

        function _subscribe(_client) {
            client = _client;
            client.inviteManager.on('new_invite', newInvite);
            client.inviteManager.on('reject_invite', rejectInvite);
            client.inviteManager.on('cancel_invite', cancelInvite);
            client.inviteManager.on('remove_invite', removeInvite);
            client.gameManager.on('user_leave', userLeave);
            client.gameManager.on('game_start', hideDialogs);
            client.gameManager.on('round_end', roundEnd);
            client.gameManager.on('game_leave', hideDialogs);
            client.gameManager.on('ask_draw', askDraw);
            client.gameManager.on('cancel_draw', cancelDraw);
            client.gameManager.on('ask_back', askTakeBack);
            client.gameManager.on('cancel_back', cancelTakeBack);
            client.chatManager.on('show_ban', showBan);
            client.on('login_error', loginError);
            $(document).on("click", hideOnClick);
        }

        function newInvite(invite) {
            var html = 'Вас пригласил в игру пользователь ' + invite.from.userName;
            if (typeof this.client.opts.generateInviteText == "function")
                html = this.client.opts.generateInviteText(invite);

            var div = showDialog(html, {
                buttons: {
                    "Принять": function() {
                        client.inviteManager.accept($(this).attr('data-userId'));
                        $(this).remove();
                    },
                    "Отклонить": function(){
                        client.inviteManager.reject($(this).attr('data-userId'));
                        $(this).remove();
                    }
                },
                close: function() {
                    client.inviteManager.reject($(this).attr('data-userId'));
                    $(this).remove();
                }
            }, true, false, false);
            div.attr('data-userId', invite.from.userId);
            div.addClass(INVITE_CLASS);
        }

        function rejectInvite(invite) {
            var html = 'Пользователь ' + invite.user.userName + ' отклонил ваше приглашение';
            var div = showDialog(html, {}, true, true, true);
        }

        function cancelInvite(opt) {
            console.log('dialogs; cancel invite', opt);
        }

        function removeInvite(invite) {
            var userId = invite.from;
            $('.' + INVITE_CLASS + '[data-userId="' + userId + '"]').remove();
        }

        function userLeave(user) {
            hideDialogs();
            var html = 'Пользователь ' + user.userName + ' покинул игру';
            var div = showDialog(html, {
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

        function askDraw(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь ' + user.userName + ' предлагает ничью';
            var div = showDialog(html,{
                buttons: {
                    "Принять": function() {
                        client.gameManager.acceptDraw();
                        $(this).remove();
                    },
                    "Отклонить": function() {
                        client.gameManager.cancelDraw();
                        $(this).remove();
                    }
                },
                close: function() {
                    client.gameManager.cancelDraw();
                    $(this).remove();
                }
            }, true, true, false);
        }

        function cancelDraw(user) {
            var html = 'Пользователь ' + user.userName + ' отклонил ваше предложение о ничье';
            var div = showDialog(html, {}, true, true, true);
        }


        function askTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь ' + user.userName + ' просит отменить ход. Разрешить ему?';
            var div = showDialog(html,{
                buttons: {
                    "Да": function() {
                        client.gameManager.acceptTakeBack();
                        $(this).remove();
                    },
                    "Нет": function() {
                        client.gameManager.cancelTakeBack();
                        $(this).remove();
                    }
                },
                close: function() {
                    client.gameManager.cancelTakeBack();
                    $(this).remove();
                }
            }, true, true, false);
            div.addClass(TAKEBACK_CLASS);
        }


        function cancelTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь ' + user.userName + ' отклонил ваше просьбу отменить ход';
            var div = showDialog(html, {}, true, true, true);
        }


        function roundEnd(data) {
            if (!data.isPlayer) {
                return;
            }
            hideDialogs();
            var result = "";
            switch (data.result){
                case 'win': result = 'Победа'; break;
                case 'lose': result = 'Поражение'; break;
                case 'draw': result = 'Ничья'; break;
                default : result = 'игра окночена';
            }
            var html = result + '<br><br> Сыграть с соперником еще раз?';
            dialogTimeout = setTimeout(function(){
                var div = showDialog(html, {
                    width: 350,
                    buttons: {
                        "Да, начать новую игру": function() {
                            $(this).remove();
                            client.gameManager.sendReady();
                        },
                        "Нет, выйти": function() {
                            $(this).remove();
                            client.gameManager.leaveGame();
                        }
                    },
                    close: function() {
                        $(this).remove();
                        client.gameManager.leaveGame();
                    }
                }, true, false);
                div.addClass(ROUNDRESULT_CLASS);
            }, client.opts.resultDialogDelay);
        }

        function loginError() {
            var html = 'Ошибка авторизации. Обновите страницу';
            var div = showDialog(html, {}, false, false, false);
        }

        function showBan(ban) {
            var html = 'Вы не можете писать сообщения в чате, т.к. добавлены в черный список ';
            if (ban.reason && ban.reason != '') html += 'за ' + ban.reason;
            else html += 'за употребление нецензурных выражений и/или спам ';
            if (ban.timeEnd) {
                html += (ban.timeEnd > 2280000000000 ? ' навсегда' : ' до ' + formatDate(ban.timeEnd));
            }
            var div = showDialog(html, {}, false, false, false);
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
            var div = $('<div>');
            div.html(html).dialog(options);
            if (draggable) {
                div.parent().draggable();
                div.addClass(DRAGGABLE_CLASS);
            }
            if (notification) {
                div.addClass(NOTIFICATION_CLASS);
            }
            if (clickHide) {
                div.addClass(HIDEONCLICK_CLASS);
            }
            return div;
        }


        function hideDialogs() {
            $('.' + NOTIFICATION_CLASS).dialog("close");
            $('.' + ROUNDRESULT_CLASS).dialog("close");
            $('.' + INVITE_CLASS).dialog("close");
            clearTimeout(dialogTimeout);
        }

        function hideNotification() {
            $('.' + NOTIFICATION_CLASS).dialog("close");
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
