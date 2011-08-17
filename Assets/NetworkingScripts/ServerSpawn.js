var playerPrefab : Transform;
// Local player information when one is instantiated
private var localPlayer : NetworkPlayer;
private var localTransformViewID : NetworkViewID;
private var isInstantiated : boolean = false;
// The server uses this to track all instantiated players
private var playerInfo : Array = new Array();

class PlayerInfo {
	var transformViewID : NetworkViewID;
	var player : NetworkPlayer;
}

function OnGUI () {
	if (Network.isClient && localPlayer.ToString() != 0 && !isInstantiated) 
		if (GUI.Button(new Rect(20,Screen.height-60, 90, 20),"SpawnPlayer")) {
			// Spawn the player on all machines
			networkView.RPC("SpawnPlayer", RPCMode.AllBuffered, localPlayer, localTransformViewID);
			isInstantiated = true;
		}
}

// Receive server initialization, record own identifier as seen by the server.
// This is later used to recognize if a network spawned player is the local player.
// Also record assigned view IDs so the server can synch the player correctly.
@RPC
function InitPlayer (player : NetworkPlayer, tViewID : NetworkViewID) {
	Debug.Log("Received player init "+ player +". ViewIDs " + tViewID);
	localPlayer = player;
	localTransformViewID = tViewID;
}

// Create a networked player in the game. Instantiate a local copy of the player, set the view IDs
// accordingly. 
@RPC
function SpawnPlayer (playerIdentifier : NetworkPlayer, transformViewID : NetworkViewID) {
	Debug.Log("Instantiating player " + playerIdentifier);
	var instantiatedPlayer : Transform = Instantiate(playerPrefab, transform.position, transform.rotation);
	var networkViews = instantiatedPlayer.GetComponents(NetworkView);
	
	// Assign view IDs to player object
	networkViews[0].viewID = transformViewID;

	// Initialize local player
	if (playerIdentifier == localPlayer) {
		Debug.Log("Enabling user input as this is the local player");
		// W are doing client prediction and thus enable the controller script + user input processing
		// Enable input network synchronization (server gets input)
		instantiatedPlayer.SendMessage("SetOwnership", playerIdentifier);
		return;
	// Initialize player on server
	} else if (Network.isServer) {
		// Record player info so he can be destroyed properly
		var playerInstance : PlayerInfo = new PlayerInfo();
		playerInstance.transformViewID = transformViewID;
		playerInstance.player = playerIdentifier;
		playerInfo.Add(playerInstance);
		Debug.Log("There are now " + playerInfo.length + " players active");
	}
}

// This runs if the scene is executed from the loader scene.
// Here we must check if we already have clients connect which must be reinitialized.
// This is the same procedure as in OnPlayerConnected except we process already
// connected players instead of new ones. The already connected players have also
// reloaded the level and thus have a clean slate.
function OnNetworkLoadedLevel() {
	if (Network.isServer && Network.connections.Length > 0) {
		for (var p : NetworkPlayer in Network.connections) {
			Debug.Log("Resending player init to "+p);
			var transformViewID : NetworkViewID = Network.AllocateViewID();
			Debug.Log("Player given view IDs "+ transformViewID);
			networkView.RPC("InitPlayer", p, p, transformViewID);
		}
	}
}

// Send initalization info to the new player, before that he cannot spawn himself
function OnPlayerConnected (player : NetworkPlayer) {
	Debug.Log("Sending player init to "+player);
	var transformViewID : NetworkViewID = Network.AllocateViewID();
	Debug.Log("Player given view IDs "+ transformViewID);
	networkView.RPC("InitPlayer", player, player, transformViewID);
}

function OnPlayerDisconnected (player : NetworkPlayer) {
	Debug.Log("Cleaning up player " + player);
	// Destroy the player object this network player spawned
	var deletePlayer : PlayerInfo;
	for (var playerInstance : PlayerInfo in playerInfo) {
		if (player == playerInstance.player) {
			Debug.Log("Destroying objects belonging to view ID " + playerInstance.transformViewID);
			Network.Destroy(playerInstance.transformViewID);
			deletePlayer = playerInstance;
		}
	}
	playerInfo.Remove(deletePlayer);
	Network.RemoveRPCs(player, 0);
	Network.DestroyPlayerObjects(player);
}
