#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef uint8_t U8;
#define FAR
#define __EMSCRIPTEN__ 1
#define STR_GAMELOST 0
#define STR_GAMEWON 1
static U8 g_FromSave;
static int intervalCalls,clearCalls,asyncCalls,drawCalls,yieldCalls,rounds;
static double intervalMilliseconds,asyncMilliseconds;
static void (*intervalCallback)(void*);
static void *intervalData;

/** 原生夹具记录浏览器调度入口，刷新实现仍来自真实timer.c。 */
int emscripten_set_interval(void(*callback)(void*),double milliseconds,void *data)
{
    intervalCalls++;
    intervalMilliseconds = milliseconds;
    intervalCallback = callback;
    intervalData = data;
    return intervalCalls;
}
void emscripten_clear_interval(int handle) {assert(handle > 0);clearCalls++;}
static void emscripten_async_call(void(*callback)(void*),void *data,int milliseconds)
{
    asyncCalls++;
    asyncMilliseconds = milliseconds;
}
void emscripten_sleep(unsigned milliseconds) {assert(milliseconds == 0);yieldCalls++;}
static U8 IsLoss(void) {return 0;}
static U8 IsWin(void) {return rounds >= 2;}
static void ShowConstStrMsg(int message) {}
static void SetCitySatrap(void) {}
static int call_hook_a(const char *name,void *context) {return 0;}
static void PlayerTactic(void) {}
static U8 FunctionMenu(void) {return 1;}
static void ShowTacticNote(void) {}
static void ComputerTactic(void) {}
static void PolicyExec(void) {}
static void ConditionUpdate(void) {rounds++;}
void gam_timer_close(U8 index);

/* ENGINE_TIMER */
/* ENGINE_TACTIC */

static void draw(void) {drawCalls++;}
int main(void)
{
    gam_timer2_open(2,draw);
    assert(intervalCalls == 1 && asyncCalls == 0);
    assert(intervalMilliseconds == 20.0);
    intervalCallback(intervalData);
    assert(drawCalls == 1);
    gam_timer2_open(1,draw);
    assert(clearCalls == 1 && intervalCalls == 2);
    assert(intervalMilliseconds >= 16.0);
    gam_timer2_open(0,NULL);
    assert(clearCalls == 2 && intervalCalls == 2);
    intervalCallback(intervalData);
    assert(drawCalls == 1);
    gam_timer_open(0,2);
    assert(asyncCalls == 1 && asyncMilliseconds == 20.0);
    assert(GameDevDrv() == 0 && rounds == 2);
    assert(yieldCalls >= rounds);
    puts("三国霸业核心刷新与策略让步回归通过");
    return 0;
}
