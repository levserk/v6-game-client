define([], function() {
    var Time = function(time, totalTime){
        var minutes = Math.floor(time / 60000),
            seconds = Math.floor((time - minutes * 60000) / 1000);
        if (minutes < 10) minutes = '0' + minutes;
        if (seconds < 10) seconds = '0' + seconds;
        return {
            timeMS: time,
            timeS: Math.floor(time / 1000),
            timePer: totalTime ? time / totalTime : null,
            timeFormat: minutes + ':' + seconds
        }
    };

    return Time;
});