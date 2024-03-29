
const chalk = require('chalk');
const { Scoreboard } = require('./Scoreboard');

class Game {

    preprocessTeams() {
        for (let team of this.teams) {
            if (!team) continue;
            team.score = 0;
            team.lockedOut = false;
            for (let member of team.members) {
                member.joined = false;
                member.focused = false;
                member.buzzing = false;
            }
        }
    }

    constructor(teamA, teamB, roundNum) {
        console.log(chalk.green('GAME CONSTRUCTOR CALLED'));
        this.teams = [teamA, teamB];
        this.preprocessTeams();
        this.opened = false;
        this.questionNum = 0;
        this.finished = false;
        this.buzzActive = null;
        this.onBonus = false;
        this.scoreboard = new Scoreboard();
        this.questionTimer = null;
        this.timeUp = false;
        this.timerRunning = false;
        //this.sendMessage = sendMessage;
        this.roundNum = roundNum;
        /*this.teams[0].members.push({ // DELETE FOR THE LOVE OF GOD
            googleId: 'DEBUG_GID',
            fullName: 'DEBUG TEST USER'
        });*/
    }
    
    makeGameFromState(gameState) {
        this.teams = gameState.teams;
        this.opened = gameState.opened;
        this.questionNum = gameState.questionNum;
        this.finished = gameState.finished;
        this.buzzActive = gameState.buzzActive;
        this.onBonus = gameState.onBonus;
        this.scoreboard = new Scoreboard();
        this.scoreboard.makeFromState(gameState.scoreboard.questions);
        this.questionTimer = null;
        this.timeUp = gameState.timeUp;
        this.timerRunning = gameState.timerRunning;
        this.roundNum = gameState.roundNum;
    }

    active() {
        return this.opened && !this.finished;
    }
    
    teamA() {
        return this.teams[0];
    }
    teamB() {
        return this.teams[1];
    }

    setTeamA(team) {
        team.score = 0;
        this.teams[0] = team;
    }
    setTeamB(team) {
        team.score = 0;
        this.teams[1] = team;
    }

    updateScores() {
        let scores = this.scoreboard.totalScores();
        for (let i = 0; i < 2; i++) {
            this.teams[i].score = scores[i];
        }
    }

    state() {
        return {
            teams: this.teams,
            opened: this.opened,
            finished: this.finished,
            buzzActive: this.buzzActive,
            answeringTeam: this.answeringTeam,
            questionNum: this.questionNum,
            onBonus: this.onBonus,
            scoreboard: this.scoreboard.state(),
            timeUp: this.timeUp,
            timerRunning: this.timerRunning,
            roundNum: this.roundNum
        };
    }

    findGoogleID(googleId) {
        for (let i = 0; i < 2; i++) {
            let team = this.teams[i];
            if (!team) continue;
            for (let j = 0; j < team.members.length; j++) {
                let member = team.members[j];
                if (googleId === member.googleId) {
                    return [member, i, j];
                }
            }
        }
        console.log(`Failed to find Google ID: ${googleId}`);
        return null;
    }

    setJoined(googleId, joined) {
        let user = this.findGoogleID(googleId);
        if (user) {
            user[0].joined = joined;
            user[0].focused = joined;
        }
    }

    start() {
        this.opened = true;
    }

    end() {
        this.finished = true;
    }
    
    buzz(googleId) {
        if (!this.active()) return null;
        if (this.buzzActive || this.onBonus) return null;
        let user = this.findGoogleID(googleId);
        if (!user) return null;
        if (this.teams[user[1]].lockedOut) return null;
        user[0].buzzing = true;
        this.buzzActive = user[0];
        this.answeringTeam = user[1];
        this.teams[user[1]].lockedOut = true;
        return this.cancelTimer();
    }

    clearBuzzer() {
        if (!this.active()) return;
        if (!this.buzzActive) return;
        this.findGoogleID(this.buzzActive.googleId)[0].buzzing = false;
        this.buzzActive = null;
        this.answeringTeam = null;
    }

    ignoreBuzz() {
        if (!this.active()) return;
        this.teams[this.findGoogleID(this.buzzActive.googleId)[1]].lockedOut = false;
        this.clearBuzzer();
    }

    correctAnswer(questionNum, playerId, teamInd, isBonus) {
        if (!this.active()) return;
        if (isBonus) {
            this.scoreboard.bonusCorrect(questionNum, teamInd);
        } else {
            this.scoreboard.tossUpCorrect(questionNum, playerId, teamInd);
        }
        this.updateScores();
    }

    incorrectAnswer(questionNum, playerId, teamInd, isBonus) {
        if (!this.active()) return;
        if (isBonus) {
            this.scoreboard.bonusIncorrect(questionNum, teamInd);
        } else {
            this.scoreboard.tossUpIncorrect(questionNum, playerId, teamInd);
        }
        this.updateScores();
    }

    negAnswer(questionNum, playerId, teamInd) {
        if (!this.active()) return;
        this.scoreboard.tossUpNeg(questionNum, playerId, teamInd);
        this.updateScores();
    }

    noAnswer(questionNum, teamInd) {
        if (!this.active()) return;
        this.scoreboard.noAnswer(questionNum, teamInd);
        this.updateScores();
    }

    allLocked() {
        if (!this.active()) return;
        return this.teams[0].lockedOut && this.teams[1].lockedOut;
    }

    unlockAll() {
        if (!this.active()) return;
        if (this.teams[0]) this.teams[0].lockedOut = false;
        if (this.teams[1]) this.teams[1].lockedOut = false;
    }

    lockAll() {
        if (!this.active()) return;
        if (this.teams[0]) this.teams[0].lockedOut = true;
        if (this.teams[1]) this.teams[1].lockedOut = true;
    }

    correctLive() {
        if (!this.active()) return null;
        this.correctAnswer(this.questionNum, this.buzzActive ? this.buzzActive.googleId : null, this.answeringTeam, this.onBonus);
        if (this.onBonus) {
            this.questionNum++;
            this.answeringTeam = null;
            this.onBonus = false;
        } else {
            let answeringTeam = this.answeringTeam;
            this.unlockAll();
            this.clearBuzzer();
            this.answeringTeam = answeringTeam; // undo the reset of answering team done by clearBuzzer()
            this.onBonus = true;
        }
        return this.cancelTimer();
    }

    incorrectLive() {
        if (!this.active()) return;
        let res = true;
        let answeringTeam = this.answeringTeam;
        this.incorrectAnswer(this.questionNum, this.buzzActive ? this.buzzActive.googleId : null, this.answeringTeam, this.onBonus);
        if (this.onBonus) {
            this.questionNum++;
            this.answeringTeam = null;
            this.cancelTimer();
        } else {
            console.log(`Answering team: ${answeringTeam}`);
            //if (answeringTeam) {
                this.teams[answeringTeam].lockedOut = true;
            //}
            this.clearBuzzer();
            if (this.allLocked()) {
                this.questionNum++;
                this.unlockAll();
            } else {
                res = false;
            }
        }
        this.onBonus = false;
        return res;
    }

    negLive() {
        if (!this.active()) return;
        this.cancelTimer();
        if (!this.buzzActive) {
            console.error(chalk.red('Trying to mark neg when no buzz active.'));
            return;
        }
        this.negAnswer(this.questionNum, this.buzzActive.googleId, this.answeringTeam);
        this.teams[this.answeringTeam].lockedOut = true;
        this.onBonus = false;
        this.clearBuzzer();
        if (this.allLocked()) {
            this.questionNum++;
            this.unlockAll();
        }
    }

    tossUpTimeUp() {
        if (!this.active()) return;
        this.lockAll();
        this.timeUp = true;
        this.timerRunning = false;
    }

    bonusTimeUp() {
        if (!this.active()) return;
        this.timeUp = true;
        this.timerRunning = false;
    }

    nextQuestion() {
        if (!this.active()) return;
        this.setQuestionNum(this.questionNum + 1);
        if (this.onBonus) {
            this.setOnBonus(false);
        }
        return this.cancelTimer();
    }

    setQuestionNum(num) {
        if (!this.active()) return;
        this.questionNum = num;
        this.buzzActive = null;
        this.answeringTeam = null;
        this.unlockAll();
        return this.cancelTimer();
    }

    setOnBonus(isBonus) {
        if (!this.active()) return;
        this.onBonus = isBonus;
        this.unlockAll();
        this.buzzActive = null;
        if (this.onBonus) {
            this.answeringTeam = this.scoreboard.whoGotTU(this.questionNum);
        }
        return this.cancelTimer();
    }

    setLocked(teamInd, locked) {
        if (!this.active()) return;
        this.teams[teamInd].lockedOut = locked;
    }

    startTimer(onTimeUp) {
        if (!this.active()) return;
        if (this.buzzActive) return;
        clearTimeout(this.questionTimer);
        if (onTimeUp) {
            this.onTimeUp = onTimeUp;
        }
        this.timeUp = false;
        this.timerRunning = true;
        let time = this.onBonus ? 22 : 7;
        this.questionTimer = setTimeout(() => {
            if (this.onBonus) {
                this.bonusTimeUp();
            } else {
                this.tossUpTimeUp();
            }
            if (onTimeUp) {
                onTimeUp(this.onBonus);
            }
        }, time*1000);
        //this.sendMessage('timerstart', time);
        return ['timerstart', time];
    }

    resetTimer() {
        if (!this.active()) return;
        clearTimeout(this.questionTimer);
        this.timeUp = false;
        this.timerRunning = true;
        let time = this.onBonus ? 22 : 7;
        this.questionTimer = setTimeout(() => {
            if (this.onBonus) {
                this.bonusTimeUp();
            } else {
                this.tossUpTimeUp();
            }
            if (this.onTimeUp) {
                this.onTimeUp(this.onBonus);
            }
        }, time*1000);
        //this.sendMessage('timerreset');
        return ['timerstart', time];
    }

    cancelTimer() {
        if (!this.active()) return;
        this.timeUp = false;
        this.timerRunning = false;
        clearTimeout(this.questionTimer);
        //this.sendMessage('timercancel');
        return ['timercancel'];
    }

    setOffset(teamInd, amount) {
        this.scoreboard.setOffset(teamInd, amount);
        this.updateScores();
    }

    setPlayedFocused(googleId, focused) {
        let user = this.findGoogleID(googleId)[0];
        user.focused = focused;
    }

}

module.exports = {
    Game
};
