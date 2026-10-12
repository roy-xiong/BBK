#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef uint8_t U8;
typedef uint16_t U16;
typedef uint32_t U32;
typedef U16 SkillID;
typedef U16 ToolID;
#define FAR
#define CMD_ATK 0
#define CMD_STGM 1
#define ATT_RANGEUNIT 5
#define ATT_RANGE 25
#define TOOL_ATT_RANGEUNIT 15
#define TOOL_ATT_RANGE 225
#define SKILL_RANGEUNIT 9
#define SKILL_RANGE 81
#define IFACE_CONID 1
#define dFgtAtRange 1
#define SKL_RNGID 2
#define GOODS_RESID 3
#define gam_memcpy memcpy
typedef struct {U8 changeAttackRange,atRange[30];} GOODS;
typedef struct {ToolID Equip[2];} PersonType;
static PersonType g_Persons[20];
static struct {U16 GenArray[20];} g_FgtParam;
static struct {U8 x,y;} g_GenPos[20];
static struct {U8 enableToolAttackRange,enableScript;} g_engineConfig;
static U8 g_FgtAtkRng[230],normalRange[25],skillRange[81];
static int hookPresent,groupEnabled,hookCalls;
static U8 GetArmType(PersonType *person) {return 0;}
static U8 *ResLoadToCon(int resource,int item,void *bank) {
    return resource == SKL_RNGID ? skillRange : normalRange;
}
static void *g_CBnkPtr;
static void bits_to_bytes(U8 *out,U8 *in,U8 width,U8 height,U8 flag) {}
int has_hook(const char *name) {
    assert(strcmp(name,"calcAttackRange") == 0);
    return hookPresent;
}
/** 记录是否进入真实核心的Hook分支，原版兵种与技能范围不在夹具中重算。 */
static void AdvancedCmdRng(U8 type,SkillID skill,U8 index) {
    hookCalls++;
    if (hookPresent && groupEnabled && type == CMD_ATK && index < 10) {
        g_FgtAtkRng[0] = 7;
        g_FgtAtkRng[1] = g_GenPos[index].x - 3;
        g_FgtAtkRng[2] = g_GenPos[index].y - 3;
        memset(g_FgtAtkRng + 3,1,49);
    }
}

/* ENGINE_ATTACK_RANGE */

int main(void) {
    g_FgtParam.GenArray[0] = 1;
    g_FgtParam.GenArray[10] = 2;
    g_GenPos[0].x = g_GenPos[0].y = 10;
    g_GenPos[10].x = g_GenPos[10].y = 10;
    memset(normalRange,1,sizeof(normalRange));
    memset(skillRange,1,sizeof(skillRange));
    hookPresent = groupEnabled = 1;
    g_engineConfig.enableScript = 0; /* 词典原版默认关闭资源脚本。 */
    FgtGetCmdRng(CMD_ATK,0,0);
    assert(hookCalls == 1 && g_FgtAtkRng[0] == 7);
    assert(g_FgtAtkRng[1] == 7 && g_FgtAtkRng[2] == 7);
    for (int i=0;i<49;i++) assert(g_FgtAtkRng[i+3] == 1);
    FgtGetCmdRng(CMD_ATK,0,10);
    assert(g_FgtAtkRng[0] == 5); /* 敌方仍沿用原版范围。 */
    FgtGetCmdRng(CMD_STGM,1,0);
    assert(g_FgtAtkRng[0] == 9); /* 群攻不会覆盖计谋范围。 */
    groupEnabled = 0;
    FgtGetCmdRng(CMD_ATK,0,0);
    assert(g_FgtAtkRng[0] == 5);
    hookPresent = 0;
    int previousCalls = hookCalls;
    FgtGetCmdRng(CMD_ATK,0,0);
    assert(hookCalls == previousCalls && g_FgtAtkRng[0] == 5);
    g_engineConfig.enableScript = 1;
    FgtGetCmdRng(CMD_ATK,0,0);
    assert(hookCalls == previousCalls + 1 && g_FgtAtkRng[0] == 5);
    puts("三国霸业核心攻击范围回归通过：原版7×7、敌方/技能原范围、关闭恢复、无Hook回退");
    return 0;
}
