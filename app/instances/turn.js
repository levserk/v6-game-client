define([], function() {
    var Turn = function(turn, user, nextPlayer){
        this.user = user;
        this.nextPlayer = nextPlayer;
        this.turn = turn;
        if (turn.userTurnTime){
            this.userTurnTime = turn.userTurnTime;
            delete turn.userTurnTime;
        }
        if (turn.userTime){
            this.userTime = turn.userTime;
            delete turn.userTime;
        }
        delete this.turn.nextPlayer;
    };
    return Turn;
});