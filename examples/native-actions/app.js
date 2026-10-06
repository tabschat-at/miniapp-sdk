import { getHost } from "../../src/index.js";
import { element, run } from "../shared/ui.js";
element("chat").onclick = () =>
  run(async () => {
    const host = getHost();
    const person = await host.identity.resolveHandle(
      element("handle").value.trim(),
    );
    await host.chat.openConversation({ recipientDid: person.did });
    element("status").textContent =
      "Conversation opening requested. In browser preview, no chat opens.";
  });
element("pay").onclick = () =>
  run(async () => {
    const host = getHost();
    const recipient = await host.payments.resolve(
      element("handle").value.trim(),
    );
    const result = await host.payments.request({
      recipientDid: recipient.did,
      asset: "USDC",
      amount: element("amount").value.trim(),
    });
    element("status").textContent =
      result.status === "sent"
        ? `Sent: ${result.digest}`
        : result.status === "cancelled"
          ? "Payment cancelled; no transfer confirmed."
          : "Check the payment status in Tabs before requesting another payment.";
  });
