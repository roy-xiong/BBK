#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

typedef uint8_t U8;
typedef uint16_t __attribute__((aligned(1))) U16;
typedef uint32_t __attribute__((aligned(1))) U32;
typedef U16 PersonID;
typedef U16 ToolID;
#define FAR
#define PID(value) ((PersonID)(value))
#define PERSON_MAX 16
#define PERSON_COUNT personCount
#define PERSON_ARMS_MAX 200000u
#define CITY_MAX 3
#define GOODS_MAX 16
#define FGTA_MAX 20
#define FGT_PLAMAX 10
#define STATE_SW 8
#define ARMTYP_NUM 6
#define LEGACY_PERSON_SIZE (sizeof(PersonType) - sizeof(U32) + sizeof(U16))
#define gam_memset memset
#define gam_memcpy memcpy
#define gam_free free
#define IF_HAS_HOOK(name) if (0)
#define BIND_U8EX(name,pointer) ((void)0)
#define BIND_U32(pointer) ((void)0)
#define CALL_HOOK() 1
#define CALL_HOOK_A() 1
#define CALL_HOOK_S() ((void)0)
#define HOOK_RETURN(value) return (value)
#define IFACE_STRID 1
#define dReading 1
#define dSaveFNam 2
#define dErrInf1 3
#define dWriting 4
#define dErrInf 5
/* ENGINE_TYPES */

static U16 personCount = PERSON_MAX;
static PersonType g_Persons[PERSON_MAX];
static PersonID g_PersonsQueue[PERSON_MAX];
static ToolID g_GoodsQueue[GOODS_MAX];
static CityType g_Cities[CITY_MAX];
static PersonID g_PlayerKing;
static U8 g_PIdx,g_MonthDate,g_LookEnemy,g_LookMovie,g_MoveSpeed;
static U16 g_YearDate;
static struct {U8 x,y,setx,sety;} g_CityPos;
static struct {
    U8 enemyArmsLimitEnabled,enableCustomRatio,compressCustomData,disableSL;
    U32 enemyArmsLimit;
    U16 ratioOfArmsToLevel;
    U8 ratioOfArmsToAge,ratioOfArmsToForce,ratioOfArmsToIQ;
} g_engineConfig;
static struct {U32 *arms;U16 at,df;U8 armsType;} g_GenAtt[2];
static struct {PersonID GenArray[FGTA_MAX];} g_FgtParam;
static struct {U8 state;} g_GenPos[FGTA_MAX];
static OrderType orderQueue[ORDER_MAX];
#define ORDERQUEUE ((U8*)orderQueue)
static U8 fighterIndexes[FIGHT_ORDER_MAX];
#define FIGHTERS_IDX fighterIndexes
static PersonID fighters[FIGHT_ORDER_MAX * 10];
#define FIGHTERS ((U8*)fighters)
static U8 *customData;

/** 仅替换磁盘IO与UI，保存和读取的字节顺序来自真实GamSaveRcd/GamLoadRcd。 */
typedef struct {U8 bytes[65536];U32 length,position;} gam_FILE;
static gam_FILE files[8];
static U32 opened,closed;
static gam_FILE *sav_fopen(U8 *name,U8 mode) {
    unsigned index = name[5] - '0';
    assert(index < 8);
    gam_FILE *file = &files[index];
    if (mode == 'r' && !file->length) return NULL;
    if (mode == 'w') file->length = 0;
    file->position = 0;opened++;
    return file;
}
static U32 gam_fwrite(U8 *data,U32 size,U32 count,gam_FILE *file) {
    assert(file->position + size * count <= sizeof(file->bytes));
    memcpy(file->bytes + file->position,data,size * count);
    file->position += size * count;file->length = file->position;
    return count;
}
static U32 gam_fread(U8 *data,U32 size,U32 count,gam_FILE *file) {
    if (file->position + size * count > file->length) return 0;
    memcpy(data,file->bytes + file->position,size * count);
    file->position += size * count;
    return count;
}
static U8 *gam_freadall(gam_FILE *file,U32 *length) {*length = 0;return NULL;}
static void gam_fclose(gam_FILE *file) {closed++;}
static void ResLoadToMem(U8 resource,U8 item,U8 *buffer) {
    if (item == dSaveFNam) strcpy((char*)buffer,"sango0.sav");else buffer[0] = 0;
}
static void GamMsgBox(U8 *message,U8 timeout) {}
static void GamDelay(U8 delay,U8 flags) {}
static void call_hook(const char *name,void *data) {}
static U16 GamGetPersonCount(void) {return personCount;}
static void GamSetPersonCount(U16 count) {personCount = count;}
static int gam_seed(void) {return 123;}
static void gam_srand(int seed) {assert(seed == 123);}
static int compress_data(U8 **out,U32 *length,U8 *data,U8 level) {return -1;}
static U8 *decompress_data(U8 *data,U32 length) {return NULL;}
static PersonID TransIdxToGen(U8 index) {return g_FgtParam.GenArray[index] - 1;}
/* ENGINE_FUNCTIONS */

/** 把真实新版存档的人物记录改为已知0x95布局，生成独立的旧格式输入夹具。 */
static void makeLegacySave(unsigned slot,U8 version) {
    gam_FILE *file = &files[slot * 2];
    U8 converted[65536];
    U32 header = 12 + sizeof(g_CityPos);
    memcpy(converted,file->bytes,header);converted[0] = version;
    U32 write = header;
    for (U32 i = 0;i < personCount;i++) {
        U8 *source = file->bytes + header + i * sizeof(PersonType);
        U16 arms;
        U32 full;
        memcpy(converted + write,source,offsetof(PersonType,Arms));
        memcpy(&full,source + offsetof(PersonType,Arms),sizeof(full));
        assert(full <= 65535);arms = full;
        memcpy(converted + write + offsetof(PersonType,Arms),&arms,sizeof(arms));
        memcpy(converted + write + offsetof(PersonType,Arms) + sizeof(arms),
               source + offsetof(PersonType,Equip),sizeof(PersonType) - offsetof(PersonType,Equip));
        write += LEGACY_PERSON_SIZE;
    }
    U32 end = header + personCount * sizeof(PersonType);
    memcpy(converted + write,file->bytes + end,file->length - end);
    write += file->length - end;
    memcpy(file->bytes,converted,write);file->length = write;
    if (version < 0x95) {
        file = &files[slot * 2 + 1];
        U32 prefix = FIGHT_ORDER_MAX + 10 * FIGHT_ORDER_MAX;
        U32 suffix = FIGHT_ORDER_MAX + sizeof(fighters);
        memmove(file->bytes + prefix,file->bytes + suffix,file->length - suffix);
        file->length -= suffix - prefix;
    }
}

int main(void) {
    assert(sizeof(PersonType) == 21 && LEGACY_PERSON_SIZE == 19);
    g_engineConfig.enableCustomRatio = 1;
    g_engineConfig.ratioOfArmsToLevel = 65535;
    g_Persons[0].Belong = 1;g_Persons[0].Level = 4;
    g_Persons[1].Belong = 2;g_Persons[1].Level = 4;g_Persons[1].Arms = 100;
    assert(PlcArmsMaxP(&g_Persons[1]) == 200000);
    g_engineConfig.enemyArmsLimitEnabled = 1;
    g_engineConfig.enemyArmsLimit = 800;
    assert(PlcArmsMaxP(&g_Persons[1]) == 800 && g_Persons[1].Arms == 100);
    assert(PlcArmsMaxP(&g_Persons[0]) == 200000);
    g_engineConfig.enemyArmsLimit = 65536;
    assert(PlcArmsMaxP(&g_Persons[1]) == 65536);
    g_engineConfig.enemyArmsLimitEnabled = 0;

    U32 arms = 200000;
    assert(CountArmsSub(&arms,65536) == 65536 && arms == 134464);
    assert(CountArmsSub(&arms,200000) == 134464 && arms == 0);
    arms = 65535;
    assert(CountArmsAdd(&arms,1,200000) == 1 && arms == 65536);
    assert(CountArmsAdd(&arms,200000,200000) == 134464 && arms == 200000);
    assert(CountArmsAdd(&arms,100,800) == 0 && arms == 200000);
    g_GenAtt[0].arms = &arms;g_GenAtt[0].at = 1000;g_GenAtt[1].df = 10;
    assert(CountAtkHurt() == 200000);
    for (U32 i = 0;i < 10;i++) {g_Persons[i].Arms = 200000;g_FgtParam.GenArray[i] = i + 1;}
    assert(FgtAllArms(0) == 2000000);

    memset(orderQueue,0xff,sizeof(orderQueue));
    g_Persons[0].Arms = 65535;g_Persons[1].Arms = 65536;g_Persons[2].Arms = 200000;
    g_Persons[2].Equip[0] = 1000;g_Persons[2].Age = 99;
    g_YearDate = 200;g_MonthDate = 6;g_PIdx = 1;
    g_Cities[0].Food = 65535;g_Cities[0].Belong = 1;
    g_engineConfig.disableSL = 1;
    assert(GamSaveRcd(1));
    U8 unchanged[65536];U32 unchangedLength = files[2].length;
    memcpy(unchanged,files[2].bytes,unchangedLength);
    assert(GamSaveRcd(0) && files[0].bytes[0] == 0x96);
    assert(files[2].length == unchangedLength && !memcmp(files[2].bytes,unchanged,unchangedLength));
    memset(g_Persons,0,sizeof(g_Persons));
    assert(GamLoadRcd(0));
    assert(g_Persons[0].Arms == 65535 && g_Persons[1].Arms == 65536 && g_Persons[2].Arms == 200000);
    assert(g_Persons[2].Equip[0] == 1000 && g_Persons[2].Age == 99);
    assert(g_Cities[0].Food == 65535 && g_YearDate == 200 && g_MonthDate == 6);

    for (U32 i = 0;i < PERSON_COUNT;i++) g_Persons[i].Arms = 65535 - i;
    for (U8 version = 0x94;version <= 0x95;version++) {
        assert(GamSaveRcd(1));
        makeLegacySave(1,version);
        memset(g_Persons,0,sizeof(g_Persons));
        assert(GamLoadRcd(1));
        assert(g_Persons[2].Arms == 65533 && g_Persons[2].Equip[0] == 1000 && g_Persons[2].Age == 99);
    }
    files[2].bytes[0] = 0x97;
    assert(!GamLoadRcd(1));
    assert(opened == closed);
    puts("三国霸业32位兵力与0x94/0x95旧档、0x96新档完整双文件回归通过");
    return 0;
}
