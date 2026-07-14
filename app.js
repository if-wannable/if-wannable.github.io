const STORAGE_KEY = "douban-poll-ledger-v1";

const sampleCsv = `captured_at,topic_id,poll_id,participant_count,result_visible,option_id,option,votes,percent,note
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843356,anna 刘耀文,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843357,Mimi 张泽禹,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843358,牙雾笑主 陈浚铭,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843359,杨梅饮 马嘉祺,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843360,章若楠 丁程鑫,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843361,Cd 冷却中贺峻霖,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843362,ahdkewn白敬亭,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843363,睡着了也困鞠婧祎,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843364,芝麻酱饼张极,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843365,香芹又青 李兰迪,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843366,卖掉裤衩来上网李煜东,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843367,FreiGeist成毅,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843368,甜酱吃一口左航,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843369,生打青椰肖战,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843370,狐狸小狗陈思罕,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843371,功夫豆浆左奇函,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:11:31+08:00,493741132,10258668,3547,false,32843372,momo王源,,,未登录/未投票页面提示“投票后可查看结果”
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843356,anna 刘耀文,905,25,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843357,Mimi 张泽禹,195,5,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843358,牙雾笑主 陈浚铭,757,21,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843359,杨梅饮 马嘉祺,773,22,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843360,章若楠 丁程鑫,712,20,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843361,Cd 冷却中贺峻霖,279,8,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843362,ahdkewn白敬亭,841,24,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843363,睡着了也困鞠婧祎,667,19,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843364,芝麻酱饼张极,209,6,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843365,香芹又青 李兰迪,483,14,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843366,卖掉裤衩来上网李煜东,253,7,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843367,FreiGeist成毅,253,7,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843368,甜酱吃一口左航,280,8,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843369,生打青椰肖战,331,9,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843370,狐狸小狗陈思罕,821,23,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843371,功夫豆浆左奇函,378,11,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843372,momo王源,567,16,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843356,anna 刘耀文,905,25,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843357,Mimi 张泽禹,195,5,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843358,牙雾笑主 陈浚铭,757,21,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843359,杨梅饮 马嘉祺,773,22,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843360,章若楠 丁程鑫,712,20,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843361,Cd 冷却中贺峻霖,279,8,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843362,ahdkewn白敬亭,842,24,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843363,睡着了也困鞠婧祎,669,19,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843364,芝麻酱饼张极,209,6,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843365,香芹又青 李兰迪,484,14,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843366,卖掉裤衩来上网李煜东,253,7,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843367,FreiGeist成毅,253,7,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843368,甜酱吃一口左航,280,8,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843369,生打青椰肖战,331,9,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843370,狐狸小狗陈思罕,821,23,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843371,功夫豆浆左奇函,378,11,已登录/已投票后可查看结果
2026-07-14T10:42:28+08:00,493741132,10258668,3561,true,32843372,momo王源,568,16,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843356,anna 刘耀文,908,25,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843357,Mimi 张泽禹,196,5,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843358,牙雾笑主 陈浚铭,761,21,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843359,杨梅饮 马嘉祺,774,22,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843360,章若楠 丁程鑫,716,20,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843361,Cd 冷却中贺峻霖,280,8,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843362,ahdkewn白敬亭,846,24,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843363,睡着了也困鞠婧祎,680,19,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843364,芝麻酱饼张极,209,6,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843365,香芹又青 李兰迪,489,14,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843366,卖掉裤衩来上网李煜东,254,7,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843367,FreiGeist成毅,254,7,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843368,甜酱吃一口左航,281,8,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843369,生打青椰肖战,334,9,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843370,狐狸小狗陈思罕,826,23,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843371,功夫豆浆左奇函,383,11,已登录/已投票后可查看结果
2026-07-14T11:12:28+08:00,493741132,10258668,3584,true,32843372,momo王源,574,16,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843356,anna 刘耀文,908,25,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843357,Mimi 张泽禹,196,5,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843358,牙雾笑主 陈浚铭,762,21,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843359,杨梅饮 马嘉祺,774,22,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843360,章若楠 丁程鑫,716,20,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843361,Cd 冷却中贺峻霖,280,8,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843362,ahdkewn白敬亭,846,24,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843363,睡着了也困鞠婧祎,681,19,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843364,芝麻酱饼张极,209,6,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843365,香芹又青 李兰迪,489,14,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843366,卖掉裤衩来上网李煜东,254,7,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843367,FreiGeist成毅,254,7,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843368,甜酱吃一口左航,281,8,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843369,生打青椰肖战,334,9,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843370,狐狸小狗陈思罕,826,23,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843371,功夫豆浆左奇函,383,11,已登录/已投票后可查看结果
2026-07-14T11:15:04+08:00,493741132,10258668,3586,true,32843372,momo王源,574,16,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843356,anna 刘耀文,909,25,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843357,Mimi 张泽禹,196,5,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843358,牙雾笑主 陈浚铭,763,21,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843359,杨梅饮 马嘉祺,776,22,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843360,章若楠 丁程鑫,717,20,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843361,Cd 冷却中贺峻霖,280,8,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843362,ahdkewn白敬亭,848,24,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843363,睡着了也困鞠婧祎,683,19,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843364,芝麻酱饼张极,209,6,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843365,香芹又青 李兰迪,490,14,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843366,卖掉裤衩来上网李煜东,254,7,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843367,FreiGeist成毅,255,7,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843368,甜酱吃一口左航,281,8,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843369,生打青椰肖战,335,9,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843370,狐狸小狗陈思罕,827,23,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843371,功夫豆浆左奇函,383,11,已登录/已投票后可查看结果
2026-07-14T11:18:40+08:00,493741132,10258668,3591,true,32843372,momo王源,576,16,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843356,anna 刘耀文,910,25,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843357,Mimi 张泽禹,197,5,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843358,牙雾笑主 陈浚铭,764,21,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843359,杨梅饮 马嘉祺,776,22,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843360,章若楠 丁程鑫,719,20,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843361,Cd 冷却中贺峻霖,281,8,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843362,ahdkewn白敬亭,850,24,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843363,睡着了也困鞠婧祎,688,19,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843364,芝麻酱饼张极,210,6,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843365,香芹又青 李兰迪,494,14,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843366,卖掉裤衩来上网李煜东,256,7,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843367,FreiGeist成毅,258,7,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843368,甜酱吃一口左航,281,8,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843369,生打青椰肖战,337,9,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843370,狐狸小狗陈思罕,831,23,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843371,功夫豆浆左奇函,386,11,已登录/已投票后可查看结果
2026-07-14T11:42:34+08:00,493741132,10258668,3606,true,32843372,momo王源,577,16,已登录/已投票后可查看结果`;

const els = {
  topicUrl: document.querySelector("#topicUrl"),
  applyUrlBtn: document.querySelector("#applyUrlBtn"),
  csvFile: document.querySelector("#csvFile"),
  exportBtn: document.querySelector("#exportBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  tabs: document.querySelectorAll(".tab"),
  views: {
    dashboard: document.querySelector("#dashboardView"),
    capture: document.querySelector("#captureView"),
    data: document.querySelector("#dataView")
  },
  trackerList: document.querySelector("#trackerList"),
  participantMetric: document.querySelector("#participantMetric"),
  participantDelta: document.querySelector("#participantDelta"),
  snapshotMetric: document.querySelector("#snapshotMetric"),
  lastCaptureMetric: document.querySelector("#lastCaptureMetric"),
  optionMetric: document.querySelector("#optionMetric"),
  visibilityMetric: document.querySelector("#visibilityMetric"),
  leaderMetric: document.querySelector("#leaderMetric"),
  leaderFoot: document.querySelector("#leaderFoot"),
  trendCanvas: document.querySelector("#trendCanvas"),
  optionTrendCanvas: document.querySelector("#optionTrendCanvas"),
  optionTrendStatus: document.querySelector("#optionTrendStatus"),
  optionLegend: document.querySelector("#optionLegend"),
  segments: document.querySelectorAll(".segment"),
  optionGrid: document.querySelector("#optionGrid"),
  rankingList: document.querySelector("#rankingList"),
  rankingStatus: document.querySelector("#rankingStatus"),
  snapshotForm: document.querySelector("#snapshotForm"),
  capturedAtInput: document.querySelector("#capturedAtInput"),
  participantInput: document.querySelector("#participantInput"),
  topicIdInput: document.querySelector("#topicIdInput"),
  pollIdInput: document.querySelector("#pollIdInput"),
  resultVisibleInput: document.querySelector("#resultVisibleInput"),
  optionEditor: document.querySelector("#optionEditor"),
  addOptionBtn: document.querySelector("#addOptionBtn"),
  noteInput: document.querySelector("#noteInput"),
  pasteArea: document.querySelector("#pasteArea"),
  parseTextBtn: document.querySelector("#parseTextBtn"),
  parseStatus: document.querySelector("#parseStatus"),
  dataRows: document.querySelector("#dataRows"),
  rowCount: document.querySelector("#rowCount")
};

let state = {
  rows: [],
  selectedKey: "",
  chartMode: "participants"
};

const OPTION_COLORS = [
  "#167447", "#2c6f99", "#a97619", "#c9553d", "#5b6abf", "#7a5c28",
  "#0f8a8a", "#b54e7a", "#6f7f28", "#8d5ab5", "#45755e", "#d06b35",
  "#2f5f9f", "#b3841f", "#6d7f96", "#b05b45", "#4d8c57"
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map((h) => h.trim());
  return rows.map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index] ?? "";
    });
    return normalizeRow(item);
  }).filter((rowItem) => rowItem.captured_at && rowItem.option);
}

function normalizeRow(item) {
  return {
    captured_at: String(item.captured_at || ""),
    topic_id: String(item.topic_id || ""),
    poll_id: String(item.poll_id || ""),
    participant_count: toNumber(item.participant_count),
    result_visible: String(item.result_visible).toLowerCase() === "true",
    option_id: String(item.option_id || ""),
    option: String(item.option || ""),
    votes: toOptionalNumber(item.votes),
    percent: toOptionalNumber(String(item.percent || "").replace("%", "")),
    note: String(item.note || "")
  };
}

function toNumber(value) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  const headers = ["captured_at", "topic_id", "poll_id", "participant_count", "result_visible", "option_id", "option", "votes", "percent", "note"];
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvEscape(row[header] ?? "")).join(","));
  });
  return `${lines.join("\n")}\n`;
}

function trackerKey(row) {
  return `${row.topic_id || "unknown"}:${row.poll_id || "poll"}`;
}

function groupedRows() {
  const groups = new Map();
  state.rows.forEach((row) => {
    const key = trackerKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function currentRows() {
  const key = state.selectedKey || [...groupedRows().keys()][0] || "";
  if (!key) return [];
  return state.rows.filter((row) => trackerKey(row) === key);
}

function snapshots(rows = currentRows()) {
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.captured_at)) map.set(row.captured_at, []);
    map.get(row.captured_at).push(row);
  });
  return [...map.entries()]
    .map(([time, items]) => ({ time, items }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

function latestSnapshot() {
  const snaps = snapshots();
  return snaps[snaps.length - 1] || null;
}

function optionList(rows = currentRows()) {
  const byId = new Map();
  rows.forEach((row) => {
    const id = row.option_id || row.option;
    byId.set(id, row);
  });
  return [...byId.values()];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    rows: state.rows,
    selectedKey: state.selectedKey
  }));
}

function mergeRows(baseRows, incomingRows) {
  const byKey = new Map();
  [...baseRows, ...incomingRows].forEach((row) => {
    const key = [row.captured_at, row.topic_id, row.poll_id, row.option_id || row.option].join("|");
    byKey.set(key, row);
  });
  return [...byKey.values()].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
}

function loadStored() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      state.rows = Array.isArray(parsed.rows) ? parsed.rows.map(normalizeRow) : [];
      state.selectedKey = parsed.selectedKey || "";
      return true;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return false;
}

async function load() {
  loadStored();
  state.rows = mergeRows(state.rows, parseCsv(sampleCsv).filter((row) => row.participant_count !== 0));
  for (const path of ["./douban_poll_log.csv", "../douban_poll_log.csv"]) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) {
        const rows = parseCsv(await response.text());
        if (rows.length) {
          state.rows = mergeRows(state.rows, rows);
          state.selectedKey = [...groupedRows().keys()][0] || "";
          return;
        }
      }
    } catch {
      // Static file use can block fetch; the embedded sample keeps the app usable.
    }
  }
  state.selectedKey = [...groupedRows().keys()][0] || "";
}

function setView(name) {
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === name));
  Object.entries(els.views).forEach(([key, view]) => view.classList.toggle("is-visible", key === name));
}

function render() {
  if (!state.selectedKey) state.selectedKey = [...groupedRows().keys()][0] || "";
  renderTrackers();
  renderMetrics();
  renderOptions();
  renderRanking();
  renderEditor();
  renderTable();
  drawChart();
  drawOptionVoteChart();
  save();
}

function renderTrackers() {
  const groups = groupedRows();
  els.trackerList.innerHTML = "";
  groups.forEach((rows, key) => {
    const latest = snapshots(rows).at(-1);
    const button = document.createElement("button");
    button.className = "tracker-item";
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(rows[0].topic_id || "未命名投票")}</strong><span>${latest ? formatDate(latest.time) : "尚未记录"} · ${rows[0].poll_id || "poll"}</span>`;
    button.addEventListener("click", () => {
      state.selectedKey = key;
      render();
    });
    if (key === state.selectedKey) button.style.borderColor = "#85b79c";
    els.trackerList.append(button);
  });
}

function renderMetrics() {
  const snaps = snapshots();
  const latest = snaps.at(-1);
  const previous = snaps.at(-2);
  const latestRows = latest?.items || [];
  const participant = latestRows[0]?.participant_count ?? 0;
  const previousParticipant = previous?.items[0]?.participant_count ?? participant;
  const delta = participant - previousParticipant;
  const visible = latestRows.some((row) => row.result_visible || row.votes !== null || row.percent !== null);
  const options = optionList();
  const leaders = latestRows.filter((row) => row.votes !== null).sort((a, b) => b.votes - a.votes);

  els.participantMetric.textContent = participant ? participant.toLocaleString("zh-CN") : "-";
  els.participantDelta.textContent = snaps.length > 1 ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString("zh-CN")} 较上次` : "首条记录";
  els.snapshotMetric.textContent = snaps.length || "-";
  els.lastCaptureMetric.textContent = latest ? formatDate(latest.time) : "尚未记录";
  els.optionMetric.textContent = options.length || "-";
  els.visibilityMetric.textContent = visible ? "已记录票数" : "只见参与人数";
  els.leaderMetric.textContent = leaders[0]?.option || "-";
  els.leaderFoot.textContent = leaders[0] ? `${leaders[0].votes.toLocaleString("zh-CN")} 票` : "等待票数";
}

function renderOptions() {
  const latest = latestSnapshot();
  const rows = latest?.items || [];
  const maxVotes = Math.max(1, ...rows.map((row) => row.votes || 0));
  els.optionGrid.innerHTML = "";
  optionList().forEach((option) => {
    const row = rows.find((item) => (item.option_id || item.option) === (option.option_id || option.option)) || option;
    const width = row.votes === null ? 0 : Math.max(4, Math.round((row.votes / maxVotes) * 100));
    const card = document.createElement("article");
    card.className = "option-card";
    card.innerHTML = `
      <strong>${escapeHtml(row.option)}</strong>
      <div class="bar" aria-hidden="true"><span style="width:${width}%"></span></div>
      <div class="card-foot">
        <span>${row.votes === null ? "未记录票数" : `${row.votes.toLocaleString("zh-CN")} 票`}</span>
        <span>${row.percent === null ? "" : `${row.percent}%`}</span>
      </div>
    `;
    els.optionGrid.append(card);
  });
}

function renderRanking() {
  const snaps = snapshots();
  const latest = snaps.at(-1);
  const previous = snaps.at(-2);
  els.rankingList.innerHTML = "";

  if (!latest) {
    els.rankingStatus.textContent = "尚无记录";
    return;
  }

  const latestRows = (latest.items || []).filter((row) => row.votes !== null && row.votes !== undefined);

  if (latestRows.length === 0) {
    els.rankingStatus.textContent = "暂无票数，结果未可见";
    return;
  }

  const sorted = [...latestRows].sort((a, b) => b.votes - a.votes);
  const maxVotes = Math.max(1, sorted[0].votes);
  const previousRank = new Map();
  if (previous) {
    const prevSorted = (previous.items || [])
      .filter((row) => row.votes !== null && row.votes !== undefined)
      .sort((a, b) => b.votes - a.votes);
    prevSorted.forEach((row, idx) => {
      previousRank.set(row.option_id || row.option, idx + 1);
    });
  }

  sorted.forEach((row, idx) => {
    const rank = idx + 1;
    const prev = previousRank.get(row.option_id || row.option);
    const delta = prev ? prev - rank : 0;
    const deltaIcon = !prev ? "" : delta > 0 ? "▲" + delta : delta < 0 ? "▼" + Math.abs(delta) : "–";
    const deltaClass = !prev ? "is-flat" : delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
    const width = Math.max(4, Math.round((row.votes / maxVotes) * 100));
    const li = document.createElement("li");
    li.className = "ranking-item" + (rank <= 3 ? " is-top" : "");
    li.innerHTML = `
      <span class="ranking-rank">${rank}</span>
      <span class="ranking-main">
        <span class="ranking-name">${escapeHtml(row.option)}</span>
        <span class="ranking-bar" aria-hidden="true"><span style="width:${width}%"></span></span>
      </span>
      <span class="ranking-meta">
        <span class="ranking-votes">${row.votes.toLocaleString("zh-CN")} 票${prev ? `<span class="ranking-delta ${deltaClass}">${deltaIcon}</span>` : ""}</span>
        <span class="ranking-percent">${row.percent === null ? "" : `${row.percent}%`}</span>
      </span>
    `;
    els.rankingList.append(li);
  });

  const totalVotes = sorted.reduce((sum, row) => sum + row.votes, 0);
  els.rankingStatus.textContent = `共 ${sorted.length} 项 · ${totalVotes.toLocaleString("zh-CN")} 票`;
}

function renderEditor() {
  const latest = latestSnapshot();
  const latestRows = latest?.items || [];
  const editorKey = `${state.selectedKey}|${latest?.time || ""}`;
  if (!els.optionEditor.dataset.ready) {
    els.capturedAtInput.value = localDateTimeValue(new Date());
    els.optionEditor.dataset.ready = "1";
  }
  if (els.optionEditor.dataset.snapshotKey !== editorKey) {
    els.topicIdInput.value = latestRows[0]?.topic_id || extractTopicId(els.topicUrl.value) || "";
    els.pollIdInput.value = latestRows[0]?.poll_id || "";
    els.participantInput.value = latestRows[0]?.participant_count || "";
    els.resultVisibleInput.checked = latestRows.some((row) => row.result_visible || row.votes !== null || row.percent !== null);
    els.optionEditor.innerHTML = "";
    (latestRows.length ? latestRows : optionList()).forEach((row) => addOptionRow(row));
    els.optionEditor.dataset.snapshotKey = editorKey;
  }
}

function renderTable() {
  const rows = [...currentRows()].sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  els.rowCount.textContent = `${rows.length} 行`;
  els.dataRows.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(row.captured_at))}</td>
      <td>${row.participant_count.toLocaleString("zh-CN")}</td>
      <td>${escapeHtml(row.option)}</td>
      <td>${row.votes === null ? "" : row.votes.toLocaleString("zh-CN")}</td>
      <td>${row.percent === null ? "" : `${row.percent}%`}</td>
      <td>${escapeHtml(row.note)}</td>
    `;
    els.dataRows.append(tr);
  });
}

function addOptionRow(row = {}) {
  const wrap = document.createElement("div");
  wrap.className = "option-row";
  wrap.innerHTML = `
    <input class="option-name" type="text" placeholder="选项" value="${escapeAttr(row.option || "")}">
    <input class="option-votes" type="number" min="0" step="1" placeholder="票数" value="${row.votes ?? ""}">
    <input class="option-percent" type="number" min="0" max="100" step="0.01" placeholder="%" value="${row.percent ?? ""}">
    <button class="mini-remove" type="button" title="移除" aria-label="移除">×</button>
  `;
  wrap.querySelector(".mini-remove").addEventListener("click", () => wrap.remove());
  els.optionEditor.append(wrap);
}

function drawChart() {
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth || 980;
  const displayHeight = canvas.clientHeight || 320;
  canvas.width = Math.floor(displayWidth * ratio);
  canvas.height = Math.floor(displayHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  const pad = { top: 22, right: 24, bottom: 42, left: 58 };
  const width = displayWidth - pad.left - pad.right;
  const height = displayHeight - pad.top - pad.bottom;
  const snaps = snapshots();
  const values = snaps.map((snap) => {
    if (state.chartMode === "votes") {
      return snap.items.reduce((sum, row) => sum + (row.votes || 0), 0);
    }
    return snap.items[0]?.participant_count || 0;
  });
  const max = Math.max(1, ...values);
  const min = Math.min(...values, max);
  const span = Math.max(1, max - min);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, displayWidth, displayHeight);
  ctx.strokeStyle = "#d9dfdc";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#68736e";
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = max - (span / 4) * i;
    ctx.fillText(Math.round(value).toLocaleString("zh-CN"), pad.left - 10, pad.top + (height / 4) * i);
  }

  if (snaps.length === 0) {
    ctx.fillStyle = "#68736e";
    ctx.textAlign = "center";
    ctx.fillText("暂无记录", displayWidth / 2, displayHeight / 2);
    return;
  }

  const points = values.map((value, index) => {
    const x = pad.left + (snaps.length === 1 ? width / 2 : (width / (snaps.length - 1)) * index);
    const y = pad.top + height - ((value - min) / span) * height;
    return { x, y, value, time: snaps[index].time };
  });

  const gradient = ctx.createLinearGradient(pad.left, 0, pad.left + width, 0);
  gradient.addColorStop(0, "#167447");
  gradient.addColorStop(0.55, "#2c6f99");
  gradient.addColorStop(1, "#a97619");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  points.forEach((point) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#167447";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = "#68736e";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const first = points[0];
  const last = points.at(-1);
  ctx.fillText(formatShortDate(first.time), first.x, pad.top + height + 14);
  if (last !== first) ctx.fillText(formatShortDate(last.time), last.x, pad.top + height + 14);
}

function drawOptionVoteChart() {
  const canvas = els.optionTrendCanvas;
  const legend = els.optionLegend;
  const status = els.optionTrendStatus;
  if (!canvas || !legend) return;

  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth || 980;
  const displayHeight = canvas.clientHeight || 380;
  canvas.width = Math.floor(displayWidth * ratio);
  canvas.height = Math.floor(displayHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  const voteSnaps = snapshots().filter((snap) => snap.items.some((row) => row.votes !== null));
  const options = optionList().map((row, index) => ({
    id: row.option_id || row.option,
    name: row.option,
    color: OPTION_COLORS[index % OPTION_COLORS.length]
  }));
  const latestVoteSnap = voteSnaps.at(-1);
  const previousVoteSnap = voteSnaps.at(-2);

  const growthSeries = options.map((option) => {
    const rawPoints = voteSnaps.map((snap, index) => {
      const row = snap.items.find((item) => (item.option_id || item.option) === option.id);
      if (!row || row.votes === null) return null;
      return { snapIndex: index, time: snap.time, votes: row.votes };
    }).filter(Boolean);
    const baseline = rawPoints[0]?.votes ?? null;
    return {
      ...option,
      baseline,
      points: rawPoints.map((point) => ({
        ...point,
        growth: baseline === null ? null : point.votes - baseline
      }))
    };
  });

  legend.innerHTML = "";
  options.forEach((option) => {
    const latestRow = latestVoteSnap?.items.find((row) => (row.option_id || row.option) === option.id);
    const previousRow = previousVoteSnap?.items.find((row) => (row.option_id || row.option) === option.id);
    const series = growthSeries.find((item) => item.id === option.id);
    const latestVotes = latestRow?.votes ?? null;
    const previousVotes = previousRow?.votes ?? null;
    const totalGrowth = latestVotes !== null && series?.baseline !== null ? latestVotes - series.baseline : null;
    const intervalGrowth = latestVotes !== null && previousVotes !== null ? latestVotes - previousVotes : null;
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-swatch" style="background:${option.color}"></span>
      <span class="legend-name" title="${escapeAttr(option.name)}">${escapeHtml(option.name)}</span>
      <span class="legend-value">${latestVotes === null ? "-" : `${latestVotes.toLocaleString("zh-CN")} 票`}${totalGrowth === null ? "" : ` · 累计 ${totalGrowth >= 0 ? "+" : ""}${totalGrowth}`}${intervalGrowth === null ? "" : ` · 上轮 ${intervalGrowth >= 0 ? "+" : ""}${intervalGrowth}`}</span>
    `;
    legend.append(item);
  });

  const pad = { top: 24, right: 28, bottom: 44, left: 60 };
  const width = displayWidth - pad.left - pad.right;
  const height = displayHeight - pad.top - pad.bottom;
  const allGrowth = growthSeries.flatMap((series) => series.points.map((point) => point.growth).filter((value) => value !== null));
  const max = Math.max(1, ...allGrowth);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, displayWidth, displayHeight);
  ctx.strokeStyle = "#d9dfdc";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i += 1) {
    const y = pad.top + (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#68736e";
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i += 1) {
    const value = max - (max / 5) * i;
    ctx.fillText(`+${Math.round(value).toLocaleString("zh-CN")}`, pad.left - 10, pad.top + (height / 5) * i);
  }

  if (voteSnaps.length === 0) {
    status.textContent = "尚无可见票数";
    ctx.fillStyle = "#68736e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("等页面显示票数后，这里会为每个选项绘制增长线", displayWidth / 2, displayHeight / 2);
    return;
  }

  status.textContent = voteSnaps.length === 1 ? "已有 1 个票数快照" : `${voteSnaps.length} 个票数快照 · 显示较首轮新增`;
  const xFor = (index) => pad.left + (voteSnaps.length === 1 ? width / 2 : (width / (voteSnaps.length - 1)) * index);
  const yFor = (value) => pad.top + height - (value / max) * height;

  growthSeries.forEach((option) => {
    const points = option.points.map((point) => ({
      x: xFor(point.snapIndex),
      y: yFor(point.growth),
      votes: point.votes,
      growth: point.growth,
      time: point.time
    }));
    if (points.length === 0) return;

    ctx.strokeStyle = option.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    points.forEach((point) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = option.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });

  const first = voteSnaps[0];
  const last = voteSnaps.at(-1);
  ctx.fillStyle = "#68736e";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(formatShortDate(first.time), xFor(0), pad.top + height + 14);
  if (last !== first) ctx.fillText(formatShortDate(last.time), xFor(voteSnaps.length - 1), pad.top + height + 14);
}

function parsePastedText(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const participantLine = lines.find((line) => /人参与/.test(line)) || "";
  const participant = toOptionalNumber((participantLine.match(/([\d,]+)\s*人参与/) || [])[1]) || 0;
  const startIndex = Math.max(0, lines.findIndex((line) => /人参与/.test(line)) + 1);
  const stopWords = new Set(["投票", "赞", "回复", "转发", "收藏", "只看楼主"]);
  const options = [];
  for (const line of lines.slice(startIndex)) {
    if (stopWords.has(line) || /投票后/.test(line)) break;
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) break;
    if (line.length > 0 && line.length <= 40) options.push(line);
  }
  return { participant, options };
}

function extractTopicId(url) {
  return (String(url).match(/topic\/(\d+)/) || [])[1] || "";
}

function appendSnapshotFromForm(event) {
  event.preventDefault();
  const capturedAt = localInputToOffsetIso(els.capturedAtInput.value) || localOffsetIso(new Date());
  const topicId = els.topicIdInput.value.trim() || extractTopicId(els.topicUrl.value);
  const pollId = els.pollIdInput.value.trim();
  const participant = toNumber(els.participantInput.value);
  const resultVisible = els.resultVisibleInput.checked;
  const note = els.noteInput.value.trim();
  const optionRows = [...els.optionEditor.querySelectorAll(".option-row")].map((row, index) => {
    const option = row.querySelector(".option-name").value.trim();
    return {
      captured_at: capturedAt,
      topic_id: topicId,
      poll_id: pollId,
      participant_count: participant,
      result_visible: resultVisible,
      option_id: `${pollId || topicId || "local"}-${index + 1}`,
      option,
      votes: toOptionalNumber(row.querySelector(".option-votes").value),
      percent: toOptionalNumber(row.querySelector(".option-percent").value),
      note
    };
  }).filter((row) => row.option);
  state.rows.push(...optionRows);
  state.selectedKey = optionRows[0] ? trackerKey(optionRows[0]) : state.selectedKey;
  els.capturedAtInput.value = localDateTimeValue(new Date());
  render();
  setView("dashboard");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value || "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatShortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function localOffsetIso(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (value) => String(value).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return `${local.toISOString().slice(0, 19)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function localInputToOffsetIso(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? localOffsetIso(date) : "";
}

function downloadCsv() {
  const blob = new Blob([toCsv(currentRows())], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `douban_poll_log_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  els.tabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
  els.segments.forEach((segment) => {
    segment.addEventListener("click", () => {
      state.chartMode = segment.dataset.chart;
      els.segments.forEach((item) => item.classList.toggle("is-active", item === segment));
      drawChart();
    });
  });
  els.applyUrlBtn.addEventListener("click", () => {
    const topicId = extractTopicId(els.topicUrl.value);
    if (topicId) els.topicIdInput.value = topicId;
    setView("capture");
  });
  els.csvFile.addEventListener("change", async () => {
    const file = els.csvFile.files[0];
    if (!file) return;
    const rows = parseCsv(await file.text());
    state.rows = rows;
    state.selectedKey = [...groupedRows().keys()][0] || "";
    els.optionEditor.innerHTML = "";
    delete els.optionEditor.dataset.snapshotKey;
    render();
  });
  els.exportBtn.addEventListener("click", downloadCsv);
  els.resetBtn.addEventListener("click", () => {
    state.rows = [];
    state.selectedKey = "";
    els.optionEditor.innerHTML = "";
    delete els.optionEditor.dataset.snapshotKey;
    localStorage.removeItem(STORAGE_KEY);
    render();
  });
  els.addOptionBtn.addEventListener("click", () => addOptionRow());
  els.snapshotForm.addEventListener("submit", appendSnapshotFromForm);
  els.parseTextBtn.addEventListener("click", () => {
    const parsed = parsePastedText(els.pasteArea.value);
    if (parsed.participant) els.participantInput.value = parsed.participant;
    if (parsed.options.length) {
      els.optionEditor.innerHTML = "";
      delete els.optionEditor.dataset.snapshotKey;
      parsed.options.forEach((option) => addOptionRow({ option }));
    }
    els.parseStatus.textContent = `识别到 ${parsed.participant || 0} 人参与，${parsed.options.length} 个选项。`;
  });
  window.addEventListener("resize", () => {
    drawChart();
    drawOptionVoteChart();
  });
}

load().then(() => {
  bindEvents();
  render();
});
