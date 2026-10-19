#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef uint8_t U8;
typedef uint16_t U16;
typedef uint32_t U32;
typedef int32_t I32;
typedef U16 PersonID;
#define FAR
#define PID(value) ((PersonID)(value))
#define PERSON_COUNT 8
#define CITY_MAX 4
#define FIGHT_ORDER_MAX 3
#define FIGHTERS_PER_ORDER 10
#define WK_SX 0
#define WK_SY 0
#define WK_EX 159
#define WK_EY 95
#define NOTE_STR8 8
#define STR_NOFIGHTER 9
#define STRING_CONST 1
#define STR_OBJ 2
#define NOTE_STR7 7
#define NOTE_STR4 4
#define STR_ARMOUT 3
#define IF_HAS_HOOK(name) if (0)
#define BIND_U8EX(name,pointer) ((void)0)
#define BIND_U32EX(name,pointer) ((void)0)
#define CALL_HOOK_A() (-1)
#define gam_memset memset
#define gam_memcpy memcpy
#define ADD16(target,value) ((target) += (value))
/* ENGINE_ORDER_CONSTANTS */

typedef struct {PersonID Belong;U16 Arms;} PersonType;
typedef struct {PersonID Belong;U16 Food;} CityType;
typedef struct {U8 OrderId,City,TimeCount;PersonID Person,Object;U16 Food;} OrderType;
typedef struct {U8 setx,sety;} CitySetType;
static PersonType g_Persons[PERSON_COUNT];
static CityType g_Cities[CITY_MAX];
static struct {U8 fixFoodOverFlow,fixOverFlow16,playerAttackAnyCity,playerDiplomacyProtection;} g_engineConfig;
static CitySetType g_CityPos;
static U8 g_PlayerKing;
static U8 sharedMemory[PERSON_COUNT * sizeof(PersonID)];
#define SHARE_MEM sharedMemory
static PersonID fighterStorage[FIGHT_ORDER_MAX * 10];
#define FIGHTERS ((U8*)fighterStorage)
static U8 fighterIndexes[FIGHT_ORDER_MAX];
#define FIGHTERS_IDX fighterIndexes
static int personCities[PERSON_COUNT];
static U32 submitted,selected,spent,returned,driverCalls;
static OrderType lastOrder;
static U8 GetPersonCity(PersonID person) {return (U8)personCities[person];}
static U32 GetCityPersons(U8 city,PersonID *queue) {
    U32 count = 0;
    for (PersonID i = 0;i < PERSON_COUNT;i++)
        if (personCities[i] == city && g_Persons[i].Belong == g_Cities[city].Belong) queue[count++] = i;
    return count;
}
static void DelPerson(U8 city,PersonID person) {assert(personCities[person] == city);personCities[person] = -1;}
static U8 AddPerson(U8 city,PersonID person) {personCities[person] = city;return 1;}
static void ReturnOrderPerson(OrderType *order,PersonID person) {returned++;AddPerson(order->City,person);}
/* ENGINE_FIGHTERS */

static U8 IsMoney(U8 city,U8 command) {return 1;}
static void ShowConstStrMsg(U8 message) {}
static void GamMsgBox(const U8 *message,U8 timeout) {}
static void ShowMapClear(void) {}
static PersonID ShowPersonControl(PersonID *people,U32 count,PersonID selectedIndex,U8 x,U8 y,U8 right,U8 bottom) {
    assert(count > 0);
    for (U32 i = 0;i < count;i++) assert(g_Persons[people[i]].Arms > 0);
    selected++;
    return 0;
}
static U16 GetFood(U16 min,U16 max) {return 1;}
static void ResLoadToMem(U8 resource,U8 item,U8 *buffer) {}
static void ShowGReport(PersonID person,U8 *message) {}
static U32 GetCitySet(CitySetType *position) {return 1;}
static U32 AttackCityRoad(U8 city,U32 x,U32 y,U32 target,U8 targetX,U8 targetY) {return 1;}
static void OrderConsumeMoney(U8 city,U8 command) {spent++;}
static U8 AddOrderEnd(OrderType *order) {submitted++;lastOrder = *order;return 1;}
static PersonID *FightOrderPersons(U8 index) {return fighterStorage + index * 10;}
/* ENGINE_BATTLE */
/* ENGINE_DIPLOMACY */

static void reset(void) {
    memset(g_Persons,0,sizeof(g_Persons));
    memset(g_Cities,0,sizeof(g_Cities));
    memset(fighterStorage,0,sizeof(fighterStorage));
    memset(fighterIndexes,0,sizeof(fighterIndexes));
    memset(&g_engineConfig,0,sizeof(g_engineConfig));
    for (U32 i = 0;i < PERSON_COUNT;i++) personCities[i] = -1;
    g_Cities[0].Belong = 1;g_Cities[0].Food = 100;
    g_Cities[1].Belong = 5;g_Cities[1].Food = 100;
    g_Persons[0].Belong = 1;g_Persons[1].Belong = 1;g_Persons[4].Belong = 5;
    personCities[0] = personCities[1] = 0;
    personCities[4] = 1;
    submitted = selected = spent = returned = driverCalls = 0;
}

int main(void) {
    PersonID fighters[10] = {0};
    OrderType order = {0};
    reset();
    BattleMake(0);
    assert(submitted == 0 && selected == 0 && spent == 0);
    g_Persons[1].Arms = 1;
    BattleMake(0);
    assert(submitted == 1 && selected == 1 && spent == 1);
    assert(personCities[0] == 0 && personCities[1] == -1 && fighterStorage[0] == 2);

    reset();
    fighters[0] = 1;
    assert(AddFightOrder(&order,fighters) == 0 && submitted == 0);
    g_Persons[0].Arms = 1;
    fighters[1] = 2;
    assert(AddFightOrder(&order,fighters) == 0 && submitted == 0);
    fighters[1] = 0;
    assert(AddFightOrder(&order,fighters) == 1 && submitted == 1);
    assert(AddFightOrder(NULL,fighters) == 0 && AddFightOrder(&order,NULL) == 0);

    const U8 diplomacy[] = {SURRENDER,ALIENATE,CANVASS,COUNTERESPIONAGE,REALIENATE,INDUCE};
    for (U32 i = 0;i < sizeof(diplomacy);i++) {
        reset();
        order.OrderId = diplomacy[i];order.City = 1;order.Person = 4;order.Object = 1;
        g_engineConfig.playerDiplomacyProtection = 1;
        personCities[4] = -1;
        assert(OrderExec(&order) == 1);
        assert(returned == 1 && driverCalls == 0 && personCities[4] == 1);
        assert(g_Persons[1].Belong == 1 && g_Cities[0].Belong == 1);
        g_engineConfig.playerDiplomacyProtection = 0;
        OrderExec(&order);
        assert(driverCalls == 1);
        g_engineConfig.playerDiplomacyProtection = 1;
        order.Person = 0;order.Object = 4;
        OrderExec(&order);
        assert(driverCalls == 2);
    }
    reset();
    g_engineConfig.playerDiplomacyProtection = 1;
    order.Person = 4;order.City = 1;order.Object = 1;order.OrderId = BATTLE;
    OrderExec(&order);
    assert(driverCalls == 1 && returned == 0);
    g_Persons[1].Belong = 5;
    order.OrderId = COUNTERESPIONAGE;
    OrderExec(&order);
    assert(driverCalls == 1 && returned == 1);
    puts("三国霸业零兵出征、命令提交与外交保护核心回归通过");
    return 0;
}
