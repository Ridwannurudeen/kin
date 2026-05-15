// Hunt — sitewide wallet-connect pill.
//
// Mounts on any element with id="walletPill" and exposes window.huntConnect()
// for programmatic use by pages that actually send transactions (post-bounty,
// mint-hunter).
//
// Depends on: ethers UMD + contracts.js (window.CHAIN_ID, RPC_URL,
// CHAINSCAN_URL, shortAddr) — both must be loaded first.

(function () {
  const pill = document.getElementById("walletPill");
  if (!pill) return;

  function setLabel(text, kind = "") {
    pill.textContent = text;
    pill.dataset.state = kind;
  }

  async function ensureNetwork(browserProvider) {
    const network = await browserProvider.getNetwork();
    if (Number(network.chainId) === window.CHAIN_ID) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ethers.toQuantity(window.CHAIN_ID) }],
      });
    } catch (e) {
      if (e.code !== 4902) throw e;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ethers.toQuantity(window.CHAIN_ID),
            chainName: "0G Aristotle",
            nativeCurrency: { name: "OG", symbol: "OG", decimals: 18 },
            rpcUrls: [window.RPC_URL],
            blockExplorerUrls: [window.CHAINSCAN_URL],
          },
        ],
      });
    }
  }

  window.huntConnect = async function huntConnect() {
    if (!window.ethereum) {
      setLabel("no wallet found", "error");
      throw new Error("wallet not found");
    }
    setLabel("connecting…");
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    await ensureNetwork(browserProvider);
    await browserProvider.send("eth_requestAccounts", []);
    const signer = await browserProvider.getSigner();
    setLabel(window.shortAddr(signer.address), "connected");
    return { signer, browserProvider, address: signer.address };
  };

  pill.addEventListener("click", () => {
    window.huntConnect().catch((e) => {
      setLabel("connect wallet", "error");
      console.error("[wallet-pill] connect failed:", e);
    });
  });

  // If the wallet is already authorised for this origin, reflect that on load
  // without prompting.
  if (window.ethereum && window.ethereum.request) {
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accs) => {
        if (Array.isArray(accs) && accs[0]) {
          setLabel(window.shortAddr(accs[0]), "connected");
        }
      })
      .catch(() => {});
  }
})();
