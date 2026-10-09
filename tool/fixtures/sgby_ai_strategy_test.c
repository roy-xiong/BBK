#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef uint8_t U8;
typedef uint16_t U16;
typedef uint32_t U32;
typedef uint16_t PersonID;
#define FAR
#define PID(value) ((PersonID)(value))
#define CITY_MAX 38
#define PERSON_MAX 32
#define PERSON_COUNT PERSON_MAX
#define ORDER_MAX 32
#define BATTLE 27
#define MOVE 14
#define AI_WORLD_ACTIVITY_ORIGINAL 25
#define STATE_NORMAL 0
#define CITY_LINKR 1
#define IFACE_CONID 0
#define KingTacticOddsIH 0
#define KingTacticOddsD 1
#define RECONNOITRE 0
#define CONSCRIPTION 1
#define DEPREDATE 2
#define gam_memset memset

typedef struct {
    PersonID Belong;
    U16 Arms;
    U8 Character;
} PersonType;
typedef struct {
    PersonID Belong;
    U16 Food,Money;
    U8 State,AvoidCalamity;
} CityType;
typedef struct {
    U8 OrderId,City,TimeCount;
    PersonID Person,Object;
    U16 Food,Arms;
} OrderType;

static PersonType g_Persons[PERSON_MAX];
static CityType g_Cities[CITY_MAX];
static OrderType orders[ORDER_MAX];
static U8 *fixtureOrderQueue = (U8*)orders;
static PersonID orderFighters[ORDER_MAX][10];
static int personCities[PERSON_MAX];
static U8 roads[CITY_MAX * 16],g_CBnkPtr[1];
static U8 g_PlayerKing,g_MonthDate = 1;
static struct {U8 aiWorldActivity,aiLevelUpSpeed;} g_engineConfig;
static union {U32 alignment;U8 bytes[PERSON_MAX * 8 + 256];} sharedMemory;
static U32 orderCount;
static int rejectOrders;
#define ORDERQUEUE fixtureOrderQueue
#define SHARE_MEM sharedMemory.bytes

/** 夹具只保存城市连接，实际邻城筛选使用从核心提取的GetRoundEnemyCity。 */
static U8 *ResLoadToCon(U8 resource,U8 item,U8 *buffer) {return roads;}
static void ResItemGetN(U8 resource,U8 item,U8 *buffer,U32 size) {memset(buffer,100,size);}
static U32 gam_rand(void) {return 0;}
static void LevelUp(PersonType *person) {}
static U16 PlcArmsMax(PersonID person) {return g_Persons[person].Arms;}
static void ComputerTacticInterior(U8 city) {}
static void ComputerTacticHarmonize(U8 city) {}
static void ComputerTacticDiplomatism(U8 city) {}

static U32 GetCityPersons(U8 city,PersonID *people)
{
    U32 person,count = 0;
    for (person = 0;person < PERSON_MAX;person++)
        if (personCities[person] == city && g_Persons[person].Belong == g_Cities[city].Belong)
            people[count++] = (PersonID)person;
    return count;
}

static void DelPerson(U8 city,PersonID person)
{
    assert(person < PERSON_MAX && personCities[person] == city);
    personCities[person] = -1;
}

/** 保留原最弱城池接口作为同优先级、同距离时的比较依赖。 */
static U8 GetWeekCity(U8 count,U8 *cities)
{
    U32 i,person,arms,bestArms = UINT32_MAX;
    U8 best = 0;
    assert(count > 0);
    for (i = 0;i < count;i++)
    {
        arms = 0;
        for (person = 0;person < PERSON_MAX;person++)
            if (personCities[person] == cities[i]) arms += g_Persons[person].Arms;
        if (arms < bestArms) {bestArms = arms;best = (U8)i;}
    }
    return cities[best];
}

static U8 AddOrderEnd(OrderType *order)
{
    if (rejectOrders || orderCount == ORDER_MAX) return 0;
    orders[orderCount++] = *order;
    return 1;
}

static U8 AddOrderHead(OrderType *order) {return AddOrderEnd(order);}

static U8 AddFightOrder(OrderType *order,PersonID *fighters)
{
    U32 slot = orderCount;
    if (!AddOrderEnd(order)) return 0;
    memcpy(orderFighters[slot],fighters,sizeof(orderFighters[slot]));
    return 1;
}

/* SGBY_ENGINE_FUNCTIONS */

static void resetWorld(void)
{
    U32 i;
    memset(g_Cities,0,sizeof(g_Cities));
    memset(g_Persons,0,sizeof(g_Persons));
    memset(roads,0,sizeof(roads));
    memset(orders,0xff,sizeof(orders));
    memset(orderFighters,0,sizeof(orderFighters));
    for (i = 0;i < PERSON_MAX;i++) personCities[i] = -1;
    g_PlayerKing = 0;
    g_engineConfig.aiWorldActivity = 100;
    g_engineConfig.aiLevelUpSpeed = 0;
    orderCount = 0;
    rejectOrders = 0;
}

static void linkCities(U8 first,U8 second)
{
    U8 edge;
    for (edge = 0;edge < 8;edge++) if (!roads[first * 16 + edge]) {
        roads[first * 16 + edge] = second + 1;break;
    }
    assert(edge < 8);
    for (edge = 0;edge < 8;edge++) if (!roads[second * 16 + edge]) {
        roads[second * 16 + edge] = first + 1;break;
    }
    assert(edge < 8);
}

static void placePerson(PersonID person,U8 city,U16 arms)
{
    g_Persons[person].Belong = g_Cities[city].Belong;
    g_Persons[person].Arms = arms;
    personCities[person] = city;
}

/** 重放已被核心接受的移动、无人城占领结果，并验证每一步都是相邻城市。 */
static void resolveOrders(void)
{
    U32 i,j;
    U8 edge;
    for (i = 0;i < orderCount;i++)
    {
        OrderType *order = &orders[i];
        assert(order->City < CITY_MAX && order->Object < CITY_MAX);
        for (edge = 0;edge < 8;edge++)
            if (roads[order->City * 16 + edge] == order->Object + 1) break;
        assert(edge < 8);
        if (order->OrderId == MOVE) {
            assert(g_Cities[order->Object].Belong == g_Persons[order->Person].Belong);
            personCities[order->Person] = order->Object;
        } else {
            assert(order->OrderId == BATTLE && !g_Cities[order->Object].Belong);
            g_Cities[order->Object].Belong = g_Cities[order->City].Belong;
            for (j = 0;j < 10;j++) if (orderFighters[i][j])
                personCities[orderFighters[i][j] - 1] = order->Object;
        }
    }
    orderCount = 0;
    memset(orders,0xff,sizeof(orders));
    memset(orderFighters,0,sizeof(orderFighters));
}

int main(void)
{
    const U8 activities[] = {0,1,25,50,80,100};
    U32 i;

    /* 真实ComputerTactic入口：所有活跃度下单将、零兵力均可出征无人城。 */
    for (i = 0;i < sizeof(activities);i++) {
        resetWorld();
        g_engineConfig.aiWorldActivity = activities[i];
        g_Cities[0].Belong = 2;
        g_Cities[4].Belong = 1;
        linkCities(0,1);linkCities(1,4);
        placePerson(1,0,0);
        ComputerTactic();
        assert(orderCount == 1 && orders[0].OrderId == BATTLE && orders[0].Object == 1);
        assert(orderFighters[0][0] == 2 && personCities[1] == -1);
    }

    /* 真实军备出征：无人城 > 强玩家城 > 弱第三方城。 */
    resetWorld();
    g_Cities[0].Belong = 2;g_Cities[2].Belong = 1;g_Cities[3].Belong = 3;
    linkCities(0,3);linkCities(0,2);linkCities(0,1);
    placePerson(1,0,1000);placePerson(2,2,60000);placePerson(3,3,1);
    assert(AiSelectAttackTarget(0) == 1);
    g_Cities[1].Belong = 2;
    assert(AiSelectAttackTarget(0) == 2);
    ComputerTacticArmament(0);
    assert(orderCount == 1 && orders[0].Object == 2);
    g_Cities[2].Belong = 2;
    assert(AiSelectAttackTarget(0) == 3);
    assert(AiSelectAttackTarget(7) == 0xff);

    /* 同级无人城按到玩家的道路距离排序，不能取资源中的第一座。 */
    resetWorld();
    g_Cities[0].Belong = 2;g_Cities[4].Belong = 1;
    linkCities(0,2);linkCities(2,3);linkCities(3,5);linkCities(5,4);
    linkCities(0,1);linkCities(1,4);
    assert(AiSelectAttackTarget(0) == 1);

    /* 通路长度遍历1至30，验证向玩家推进没有“三座城”或固定步数上限。 */
    for (U8 neutralCount = 1;neutralCount <= 30;neutralCount++) {
        U8 playerCity = neutralCount + 1;
        U8 rearCity = neutralCount + 2;
        resetWorld();
        g_Cities[0].Belong = 2;g_Cities[rearCity].Belong = 2;
        g_Cities[playerCity].Belong = 1;
        linkCities(rearCity,0);
        for (U8 city = 0;city < playerCity;city++) linkCities(city,city + 1);
        placePerson(1,0,1000);placePerson(2,rearCity,2000);
        for (i = 1;i <= neutralCount;i++) {
            ComputerTactic();
            assert(orderCount > 0);
            resolveOrders();
            assert(g_Cities[i].Belong == 2);
        }
        assert(AiSelectAttackTarget(neutralCount) == playerCity);
        assert(AiFrontlineNextCity(neutralCount) == 0xff);
        if (neutralCount > 1) assert(AiFrontlineNextCity(0) == 1);
    }

    /* 己方前线同时面向玩家和第三方时，后方调兵始终优先靠近玩家。 */
    resetWorld();
    g_Cities[0].Belong = 2;g_Cities[1].Belong = 2;g_Cities[2].Belong = 2;
    g_Cities[3].Belong = 3;g_Cities[4].Belong = 1;
    linkCities(0,2);linkCities(2,3);linkCities(0,1);linkCities(1,4);
    assert(AiFrontlineNextCity(0) == 1);
    assert(AiFrontlineNextCity(1) == 0xff);

    /* 两座己方城抢同一无人城时只提交一次出征。 */
    resetWorld();
    g_Cities[0].Belong = 2;g_Cities[2].Belong = 2;g_Cities[4].Belong = 1;
    linkCities(0,1);linkCities(2,1);linkCities(1,4);
    placePerson(1,0,10);placePerson(2,2,10);
    ComputerTactic();
    assert(orderCount == 1 && personCities[2] == 2);

    /* 队列拒绝命令不能删将；玩家不自动出征；没有己方道路不能越境调兵。 */
    resetWorld();
    g_Cities[0].Belong = 2;g_Cities[4].Belong = 1;
    linkCities(0,1);placePerson(1,0,0);rejectOrders = 1;
    assert(AiAdvanceStrategicFront(0) == 0 && personCities[1] == 0);
    assert(AiAdvanceStrategicFront(4) == 0 && orderCount == 0);
    assert(AiFrontlineNextCity(4) == 0xff);

    puts("三国霸业核心策略回归通过");
    return 0;
}
