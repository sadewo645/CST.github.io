const client = mqtt.connect(
  "wss://1a060a8841ae4b9cb2b9224e17e87cce.s1.eu.hivemq.cloud:8884/mqtt",
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
