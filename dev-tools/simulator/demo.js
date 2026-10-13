const collection = "org.example.simulator.note";
const actions = {
  identity: () => host.identity.getSelf(),
  auth: () =>
    host.auth.getAssertion({
      audience: "https://backend.example.invalid",
      nonce: "simulator_challenge_1234567890",
    }),
  chat: () =>
    host.chat.openConversation({
      recipientDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
    }),
  share: () =>
    tabsSimulator.shareToContact({
      title: "Host playground",
      url: "https://example.invalid/playground",
    }),
  message: () =>
    tabsSimulator.messageContact({ text: "Hey! Take a look at my mini-app." }),
  payment: () =>
    host.payments.request({
      recipientDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
      amount: "0.01",
      asset: "USDC",
    }),
  write: () =>
    host.records.create({
      collection,
      value: {
        $type: collection,
        text: "Hello from the simulator",
        createdAt: new Date().toISOString(),
      },
    }),
  read: () => host.publicData.query({ collection }),
  file: () =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files[0];
        resolve(
          file
            ? { name: file.name, size: file.size, type: file.type }
            : { status: "cancelled" },
        );
      };
      input.oncancel = () => resolve({ status: "cancelled" });
      input.click();
    }),
};
for (const button of document.querySelectorAll("[data-action]"))
  button.onclick = async () => {
    button.disabled = true;
    try {
      const result = await actions[button.dataset.action]();
      document.getElementById("result").textContent = JSON.stringify(
        result ?? { status: "completed" },
        null,
        2,
      );
    } catch (error) {
      document.getElementById("result").textContent =
        `${error.code ?? "ERROR"}: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  };

// A Tabs user is already signed into the host before this app opens.
host.identity
  .getSelf()
  .then((profile) => {
    document.getElementById("result").textContent = JSON.stringify(
      {
        signedInAs: profile.displayName,
        handle: profile.handle,
        did: profile.did,
      },
      null,
      2,
    );
  })
  .catch((error) => {
    document.getElementById("result").textContent =
      `${error.code}: ${error.message}`;
  });
