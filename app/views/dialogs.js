define(function() {
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
        var client;
        var dialogTimeout;
        var inviteTimeout = 30;
        var TIMEDIV = '<div class="inviteTime">Осталось: <span>'+inviteTimeout+'</span> секунд</div>';

        function _subscribe(_client) {
            client = _client;
            client.inviteManager.on('new_invite', newInvite);
            client.inviteManager.on('reject_invite', rejectInvite);
            client.inviteManager.on('cancel_invite', cancelInvite);
            client.inviteManager.on('remove_invite', removeInvite);
            client.gameManager.on('user_leave', userLeave);
            client.gameManager.on('turn', userTurn);
            client.gameManager.on('game_start', hideDialogs);
            client.gameManager.on('round_end', roundEnd);
            client.gameManager.on('game_leave', leaveGame);
            client.gameManager.on('ask_draw', askDraw);
            client.gameManager.on('cancel_draw', cancelDraw);
            client.gameManager.on('ask_back', askTakeBack);
            client.gameManager.on('cancel_back', cancelTakeBack);
            client.chatManager.on('show_ban', showBan);
            client.on('login_error', loginError);
            $(document).on("click", hideOnClick);
            inviteTimeout = client.inviteManager.inviteTimeoutTime;
            TIMEDIV = '<div class="inviteTime">Осталось: <span>'+inviteTimeout+'</span> секунд</div>';
        }

        function newInvite(invite) {
            var html = 'Вас пригласил в игру пользователь <b>' + invite.from.userName + '</b>';
            if (typeof this.client.opts.generateInviteText == "function")
                html = this.client.opts.generateInviteText(invite);
                html += TIMEDIV;
            var div = showDialog(html, {
                buttons: {
                    "Принять": function() {
                        clearInterval(invite.data.timeInterval);
                        client.inviteManager.accept($(this).attr('data-userId'));
                        $(this).remove();
                    },
                    "Отклонить": function(){
                        clearInterval(invite.data.timeInterval);
                        client.inviteManager.reject($(this).attr('data-userId'));
                        $(this).remove();
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
            var html = 'Пользователь <b>' + invite.user.userName + '</b>';
            if (invite.reason != 'timeout')
                html += ' отклонил ваше приглашение';
            else html += ' превысил лимит ожидания в '+inviteTimeout+' секунд';
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
            var html = 'Пользователь <b>' + user.userName + '</b> предлагает ничью';
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
            div.addClass(GAME_CLASS);
        }

        function cancelDraw(user) {
            var html = 'Пользователь <b>' + user.userName + '</b> отклонил ваше предложение о ничье';
            var div = showDialog(html, {}, true, true, true);
        }

        function askTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь <b>' + user.userName + '</b> просит отменить ход. Разрешить ему?';
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
            div.addClass(GAME_CLASS);
        }

        function cancelTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь <b>' + user.userName + '</b> отклонил ваше просьбу отменить ход';
            var div = showDialog(html, {}, true, true, true);
        }


        function roundEnd(data) {
            if (!data.isPlayer) {
                return;
            }
            var oldElo = +client.getPlayer()[data.mode].ratingElo;
            var oldRank = +client.getPlayer()[data.mode].rank;
            var newElo = +data['ratings'][client.getPlayer().userId].ratingElo;
            var newRank = +data['ratings'][client.getPlayer().userId].rank;
            var eloDif = newElo - oldElo;
            console.log('round_end;', data, oldElo, newElo, oldRank, newRank);
            hideDialogs();
            var result = "";
            switch (data.result){
                case 'win': result = 'Победа'; break;
                case 'lose': result = 'Поражение'; break;
                case 'draw': result = 'Ничья'; break;
                default : result = 'игра окночена';
            }
            result += '<b> (' + (eloDif >= 0 ? '+':'') + eloDif + ' очков) </b>';
            switch (data.action){
                case 'timeout': result +=  (data.result == 'win' ? 'У соперника ' : 'У Вас ') + ' закончилось время';
                    break;
                case 'throw': result +=  (data.result == 'win' ? 'Соперник сдался ' : 'Вы сдались ');
                    break;
            }
            var rankResult = '';
            if (newRank > 0) {
                if (data.result == 'win' && oldRank > 0 && newRank < oldRank) {
                    rankResult = 'Вы поднялись в общем рейтинге с ' + oldRank + ' на ' + newRank + ' место.';
                } else rankResult = 'Вы занимаете ' + newRank + ' место в общем рейтинге.';
            }
            var html = '<p>' + result + '</p><p>' + rankResult +'</p><br>' +
                '<span class="'+ACTION_CLASS+'">Сыграть с соперником еще раз?</span>';

            var div = showDialog(html, {
                width: 350,
                buttons: {
                    "Да, начать новую игру": function () {
                        $(this).remove();
                        client.gameManager.sendReady();
                    },
                    "Нет, выйти": function () {
                        $(this).remove();
                        client.gameManager.leaveGame();
                    },
                    "Ок" : function() {
                        $(this).remove();
                        client.gameManager.leaveRoom();
                    }
                },
                close: function () {
                    $(this).remove();
                    client.gameManager.leaveGame();
                }
            }, true, false);
            div.addClass(ROUNDRESULT_CLASS);
            div.parent().find(":button:contains('Ок')").hide();
            // show dialog result with delay
            div.parent().hide();
            dialogTimeout = setTimeout(function(){
                div.parent().show()
            }, client.opts.resultDialogDelay);
            div.addClass(GAME_CLASS);
        }

        function userLeave(user) {
            hideNotification();
            var html = 'Пользователь <b>' + user.userName + '</b> покинул игру';
            var div = $('.'+ROUNDRESULT_CLASS);
            if (div && div.length>0){   // find round result dialog and update it
                div.parent().find(':button').hide();
                div.parent().find(":button:contains('Ок')").show();
                div.find('.'+ACTION_CLASS).html(html);
            } else {
                div = showDialog(html, {
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
            var div = $('<div>');
            var prevFocus = document.activeElement || document;
            div.html(html).dialog(options);
            div.parent().find(':button').attr('tabindex', '-1');
            document.activeElement.blur();
            $(prevFocus).focus();
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
