define(['module'], function (module) {
    'use strict';
    var dict = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
        'о': 'o', 'п': 'p', 'р': 'r','с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h',
        'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh','ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    var Translit = function (text) {
        if (typeof text != "string" || !text.length) return text;
        var result = '', char;
        for (var i = 0; i < text.length; i++) {
            char = text[i];
            if (dict[char] != null ) {
                result += dict[char];
            } else
                if (dict[char.toLowerCase()] != null){
                    result += dict[char.toLowerCase()].toUpperCase();
                }
            else {
                result += char;
            }
        }
        return result;
    };

    Translit.test = function(){
        var text = 'Съешь Ещё Этих мягких Французских булок, да выпей Же чаю';
        console.log('translit text before: ', text);
        console.log('translit text after: ', Translit(text));
    };

    return Translit;
});
