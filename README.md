# V6-Game-Client

    Клиент для сервера v6-game-server пошаговых игр

## Установка

    Для клиента необходимы библиотеки:

- `jquery`
- `jquery-ui`
- `underscore`
- `backbone`

    Подключение выглядит следующим образом:

``` html
    <link rel="stylesheet" href="//logic-games.spb.ru/v6-game-client/build/v6-game-client.css"/>
    <script src="//logic-games.spb.ru/v6-game-client/app/lib/jquery-2.1.1.min.js"></script>
    <script src="//logic-games.spb.ru/v6-game-client/app/lib/jquery-ui.js"></script>
    <script src="//logic-games.spb.ru/v6-game-client/app/lib/underscore-min.js"></script>
    <script src="//logic-games.spb.ru/v6-game-client/app/lib/backbone-min.js"></script>
    <script src="//logic-games.spb.ru/v6-game-client/build/v6-game-client.js"></script>
```

    Поддерживается require.js (//logic-games.spb.ru/v6-game-client/build/v6-game-client.req.js)

## Запуск
    Создание и запуск клиента:

``` js
    // пользователь
    var user = {
        userId: "userId",
        userName: "userName",
        sign: "sign"
    };

    // настройки
    var settings = {}

    window.client = new Client(settings);
    window.client.init(user);
```

    Создание и передача в функцию init() пользователя не обязательно, если есть глобальные переменные:

``` js
     window._userId = "userId";
     window._userName = "userName";
     window._sign = "sign";
```

    Полный пример можно увидеть в файлах /app/index_min.html и /app/app.js
## Настройки
    Настройки клиента с параметрами по умолчанию:

``` js
    {
        port: "8080",               // порт подключения к серверу
        domain: document.domain,    // домен, адрес подключения к серверу
        game: "test",               // навзвание игры, используется в адресе подключения
        https: false,               // https
        resultDialogDelay: 0,       // задержка в мс перед показом окна с результатом раунда
        reload: false,              // перезагружать страницу при переподключении
        autoShowProfile: false,     // автоматически открывать профиль игроков
        autoReconnect: false,       // автоматически переподключатся при потери соединения
        idleTimeout: 60,            // время в сек. после которого пользователь становится неактивным
        isAdmin: false,             // флаг админ ли пользователь
        getUserParams: null,        // функция получения настроек пользователя для игры, будут переданы с приглашением
        generateInviteText: null,   // функция генерации текста приглашения, в нее будут переданы настройки из функции выше
        initRating: null,           // функции инициализации настроек рейтинга
        initHistory: null,          // функция инициализации настроек истории
        generatePenaltyText: null,  // функция генерации строки штрафа в истории
        blocks:{                    // id блоков на странице в которые будут добавлены представления
            userListId:'userListDiv',
            chatId:'chatDiv',
            ratingId:'ratingDiv',
            historyId:'ratingDiv',
            profileId:'ratingDiv'
        },
        images:{                    // список изображений
            close:      '//logic-games.spb.ru/v6-game-client/app/i/close.png',
            spin:       '//logic-games.spb.ru/v6-game-client/app/i/spin.gif',
            sortAsc:    '//logic-games.spb.ru/v6-game-client/app/i/sort-asc.png',
            sortDesc:   '//logic-games.spb.ru/v6-game-client/app/i/sort-desc.png',
            sortBoth:   '//logic-games.spb.ru/v6-game-client/app/i/sort-both.png',
            del:        '//logic-games.spb.ru/v6-game-client/app/i/delete.png'
        };
        sounds: {                   // список звуков с настройками
            start: {
                src: 'audio/v6-game-start.ogg'
            },
            turn: {
                src: 'audio/v6-game-turn.ogg',
                volume: 0.5,
                enable: false
            },
            win: {
                src: 'audio/v6-game-win.ogg'
            },
            lose: {
                src: 'audio/v6-game-lose.ogg'
            },
            invite: {
                src: 'audio/v6-invite.ogg'
            },
            timeout: {
                src: 'audio/v6-timeout.ogg'
            }
        };
        settings:{                  // настройки пользователя по умолчанию
            disableInvite: false,
            sounds: true
        },
        // шаблон для настроек пользователя
        settingsTemplate: "settingsTemplate"
    }
```

    пример настроек можно увидеть в файле index_min.html

## Методы

    Список наиболее важных методов:

``` js
    /*
    * покинуть игру
    */
    client.gameManager.leaveGame();

    /*
    * предложить ничью
    */
    client.gameManager.sendDraw();

    /*
    * сделать ход
    */
    client.gameManager.sendTurn(turn: Object);

    /*
    * открыть рейтинг
    */
    client.ratingManager.getRatings();

    /*
    * открыть историю
    */
    client.historyManager.getHistory();

    /*
    * открыть натройки
    */
    client.viewsManager.showSettings();

    /*
    * сделать или запросить ход назад
    */
    gameManager.sendTakeBack();

    /*
    * отправить игровое событие
    */
    gameManager.sendEvent(type: String, event: Object);

    /*
    * получить игрока
    */
    gameManager.client.getPlayer();
```

## События
    Подписка на основные игровые события

``` js

    // авторизация пользователя на сервере
    // data: User
    client.on('login', function(data){
        console.log('main;', 'login', data.userId, data.userName);
        var you =  client.getPlayer();
    });

    // начало игры
    // data: Room
    client.gameManager.on('game_start', function(data){
        console.log('main;','game_start, room: ', data);
    });

    // начало игрового раунда
    // data: Room
    client.gameManager.on('round_start', function(data){
        console.log('main;','round_start, room: ', data);
    });

    // ход игрока, свой тоже
    // data: {
    //          user: User,
    //          turn: Object
    //       }
    client.gameManager.on('turn', function(data){
        console.log('main;','turn', data.turn, 'is your turn: ', data.user == client.getPlayer().userId);
    });

    // переход хода
    // data: User
    client.gameManager.on('switch_player', function(data){
        console.log('main;','switch_player', 'next: ', data, 'your next: ', data.userId == client.getPlayer().userId);
    });

    //
    // data: Event
    client.gameManager.on('event', function(data){
        console.log('main;','event', data);
    });

    // игровое событие
    // data: Event
    client.gameManager.on('timeout', function(data){
        console.log('main;','timeout', 'user: ', data.user, 'is your timeout: ', data.user == client.getPlayer());
    });

    // конец раунда
    // data: GameResult
    client.gameManager.on('round_end', function(data){
        console.log('main;','round_end', data, 'your win: ', data.winner == client.getPlayer().userId);
    });

    // выход из игры
    client.gameManager.on('game_leave', function(data){
        console.log('main;','game_leave room:', data);
    });

    // игра перезагружена (при переподключении)
    // data : Array (history)
    client.gameManager.on('game_load', function(data){
        console.log('main;','game_loaded, game history:', data);
    });

    // игрок взял ход назад
    client.gameManager.on('take_back', function(data){
        console.log('main;','take_back user: ', data.user, 'history:', data.history);
    });

    // вермя на ход, эмитится каждые 300 мс
    // data.user: User, data: time
    client.gameManager.on('time', function(data){
       console.log('main;','time user:', data);
    });

    // игрок потерял или вернул фокус окна
    // data.windowHasFocus: boolean, data.user: User
    client.gameManager.on('focus', function(data){
       console.log('main;', 'user changed window focus, window has focus:', data.windowHasFocus, ' user: ', data.user);
    });

    // игра загружена из истории
    // game: Game
    client.historyManager.on('game_load', function(game){
        console.log('main;','history game loaded, game:', game);
    });

    // пользователь изменил настройку в параметрах
    // data: SettingsProperty
    client.on('settings_changed', function(data){
        console.log('main;','settings_changed property:', data);
    });

    // пользователь сохранил новые настройки
    // data: Settings
    client.on('settings_saved', function(data){
        console.log('main;','settings_changed settings:', data);
    });
```