const client = mqtt.connect(
  "wss://65740a8802bf4a778f388ff5c1a23dd2.s1.eu.hivemq.cloud:8884/mqtt",
  {
    username: "CstTest123",
    password: "ZY@SKrww3fCzM@e",
  }
);

client.on("connect", () => {
  console.log("MQTT Connected");
  client.subscribe("cst/tank01/telemetry");
});

client.on("message", (topic, message) => {
  const data = JSON.parse(message.toString());

  const levels = normalizeLevels(data);
  updateKPIs(data, levels);
  updateTankSVG(levels);
  updateAlarms(data, levels);
  pushChartPoint(data);

  setConnection(true, new Date().toISOString(), false);
  setStaleState(false);
});

client.on("error", (err) => {
  console.error("MQTT Error:", err);
  setConnection(false, null, true);
  setStaleState(true);
});

client.on("close", () => {
  console.log("MQTT Disconnected");
  setConnection(false, null, true);
  setStaleState(true);
});
