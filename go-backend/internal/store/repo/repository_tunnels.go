package repo

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"

	"go-backend/internal/store/model"
)

type tunnelEntryInfo struct {
	entryCount int
	inIps      []string
}

func (r *Repository) getTunnelEntryInfo(tunnelIDs []int64, tunnelInIPs map[int64]string) map[int64]tunnelEntryInfo {
	result := make(map[int64]tunnelEntryInfo)
	if len(tunnelIDs) == 0 {
		return result
	}

	type entryNode struct {
		TunnelID int64
		NodeID   int64
	}
	var entries []entryNode
	r.db.Model(&model.ChainTunnel{}).
		Select("tunnel_id, node_id").
		Where("tunnel_id IN (?) AND chain_type = ?", tunnelIDs, "1").
		Order("id ASC").
		Find(&entries)

	tunnelEntries := make(map[int64][]int64)
	nodeSet := make(map[int64]struct{})
	nodeIDs := make([]int64, 0)
	for _, e := range entries {
		tunnelEntries[e.TunnelID] = append(tunnelEntries[e.TunnelID], e.NodeID)
		if _, exists := nodeSet[e.NodeID]; !exists {
			nodeSet[e.NodeID] = struct{}{}
			nodeIDs = append(nodeIDs, e.NodeID)
		}
	}

	type nodeIPInfo struct {
		ID         int64
		ServerIP   string
		ServerIPV4 sql.NullString
		ServerIPV6 sql.NullString
		ExtraIPs   sql.NullString
	}
	var nodes []nodeIPInfo
	if len(nodeIDs) > 0 {
		r.db.Model(&model.Node{}).
			Select("id, server_ip, server_ip_v4, server_ip_v6, extra_ips").
			Where("id IN (?)", nodeIDs).
			Find(&nodes)
	}

	nodeIPMap := make(map[int64][]string)
	for _, n := range nodes {
		var ips []string
		add := func(v string) {
			trimmed := strings.TrimSpace(v)
			if trimmed != "" {
				ips = append(ips, trimmed)
			}
		}
		if n.ServerIPV4.Valid {
			add(n.ServerIPV4.String)
		}
		if n.ServerIPV6.Valid {
			add(n.ServerIPV6.String)
		}
		add(n.ServerIP)
		if n.ExtraIPs.Valid && strings.TrimSpace(n.ExtraIPs.String) != "" {
			for _, part := range strings.Split(n.ExtraIPs.String, ",") {
				add(part)
			}
		}
		nodeIPMap[n.ID] = ips
	}

	for _, tid := range tunnelIDs {
		var allIPs []string
		seen := make(map[string]struct{})
		addUnique := func(ip string) {
			trimmed := strings.TrimSpace(ip)
			if trimmed != "" {
				if _, ok := seen[trimmed]; !ok {
					seen[trimmed] = struct{}{}
					allIPs = append(allIPs, trimmed)
				}
			}
		}

		entryNodeIDs := tunnelEntries[tid]
		for _, nid := range entryNodeIDs {
			for _, ip := range nodeIPMap[nid] {
				addUnique(ip)
			}
		}

		if inIP, ok := tunnelInIPs[tid]; ok && inIP != "" {
			for _, part := range strings.Split(inIP, ",") {
				addUnique(part)
			}
		}

		result[tid] = tunnelEntryInfo{
			entryCount: len(entryNodeIDs),
			inIps:      allIPs,
		}
	}

	return result
}

func (r *Repository) ListUserAccessibleTunnels(userID int64) ([]map[string]interface{}, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	type row struct {
		ID   int64
		Name string
		InIP sql.NullString
	}
	var rows []row
	err := r.db.Model(&model.UserTunnel{}).
		Select("tunnel.id, tunnel.name, tunnel.in_ip").
		Joins("JOIN tunnel ON tunnel.id = user_tunnel.tunnel_id").
		Where("user_tunnel.user_id = ? AND tunnel.status = 1", userID).
		Order("tunnel.inx ASC, tunnel.id ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	tunnelIDs := make([]int64, 0, len(rows))
	tunnelInIPs := make(map[int64]string, len(rows))
	for _, rw := range rows {
		tunnelIDs = append(tunnelIDs, rw.ID)
		if rw.InIP.Valid {
			tunnelInIPs[rw.ID] = rw.InIP.String
		}
	}
	portRangeMap := r.getTunnelEntryPortRanges(tunnelIDs)
	entryInfoMap := r.getTunnelEntryInfo(tunnelIDs, tunnelInIPs)

	items := make([]map[string]interface{}, 0, len(rows))
	for _, rw := range rows {
		item := map[string]interface{}{"id": rw.ID, "name": rw.Name}
		if pr, ok := portRangeMap[rw.ID]; ok {
			item["portRangeMin"] = pr.min
			item["portRangeMax"] = pr.max
		}
		if entry, ok := entryInfoMap[rw.ID]; ok {
			item["inNodeNum"] = entry.entryCount
			item["inIp"] = strings.Join(entry.inIps, ",")
			item["inIps"] = entry.inIps
		} else {
			item["inNodeNum"] = 0
			item["inIp"] = ""
			item["inIps"] = []string{}
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *Repository) ListEnabledTunnelSummaries() ([]map[string]interface{}, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	type row struct {
		ID   int64
		Name string
		InIP sql.NullString
	}
	var rows []row
	err := r.db.Model(&model.Tunnel{}).Select("id, name, in_ip").Where("status = 1").Order("inx ASC, id ASC").Find(&rows).Error
	if err != nil {
		return nil, err
	}

	tunnelIDs := make([]int64, 0, len(rows))
	tunnelInIPs := make(map[int64]string, len(rows))
	for _, rw := range rows {
		tunnelIDs = append(tunnelIDs, rw.ID)
		if rw.InIP.Valid {
			tunnelInIPs[rw.ID] = rw.InIP.String
		}
	}
	portRangeMap := r.getTunnelEntryPortRanges(tunnelIDs)
	entryInfoMap := r.getTunnelEntryInfo(tunnelIDs, tunnelInIPs)

	items := make([]map[string]interface{}, 0, len(rows))
	for _, rw := range rows {
		item := map[string]interface{}{"id": rw.ID, "name": rw.Name}
		if pr, ok := portRangeMap[rw.ID]; ok {
			item["portRangeMin"] = pr.min
			item["portRangeMax"] = pr.max
		}
		if entry, ok := entryInfoMap[rw.ID]; ok {
			item["inNodeNum"] = entry.entryCount
			item["inIp"] = strings.Join(entry.inIps, ",")
			item["inIps"] = entry.inIps
		} else {
			item["inNodeNum"] = 0
			item["inIp"] = ""
			item["inIps"] = []string{}
		}
		items = append(items, item)
	}
	return items, nil
}

type tunnelPortRange struct {
	min int
	max int
}

func (r *Repository) getTunnelEntryPortRanges(tunnelIDs []int64) map[int64]tunnelPortRange {
	result := make(map[int64]tunnelPortRange)
	if len(tunnelIDs) == 0 {
		return result
	}

	type entryNode struct {
		TunnelID int64
		NodeID   int64
	}
	var entries []entryNode
	r.db.Model(&model.ChainTunnel{}).
		Select("tunnel_id, node_id").
		Where("tunnel_id IN (?) AND chain_type = ?", tunnelIDs, "1").
		Find(&entries)

	nodeIDs := make([]int64, 0, len(entries))
	nodeSet := make(map[int64]struct{})
	for _, e := range entries {
		if _, exists := nodeSet[e.NodeID]; !exists {
			nodeSet[e.NodeID] = struct{}{}
			nodeIDs = append(nodeIDs, e.NodeID)
		}
	}

	type nodePort struct {
		ID   int64
		Port string
	}
	var nodePorts []nodePort
	if len(nodeIDs) > 0 {
		r.db.Model(&model.Node{}).Select("id, port").Where("id IN (?)", nodeIDs).Find(&nodePorts)
	}

	nodePortMap := make(map[int64]string)
	for _, np := range nodePorts {
		nodePortMap[np.ID] = np.Port
	}

	for _, e := range entries {
		portSpec := nodePortMap[e.NodeID]
		if portSpec == "" {
			continue
		}
		minP, maxP := parsePortRangeMinMax(portSpec)
		if minP <= 0 || maxP <= 0 {
			continue
		}
		pr, exists := result[e.TunnelID]
		if !exists {
			result[e.TunnelID] = tunnelPortRange{min: minP, max: maxP}
		} else {
			if minP < pr.min {
				pr.min = minP
			}
			if maxP > pr.max {
				pr.max = maxP
			}
			result[e.TunnelID] = pr
		}
	}
	return result
}

func parsePortRangeMinMax(input string) (int, int) {
	input = strings.TrimSpace(input)
	if input == "" {
		return 0, 0
	}
	minPort, maxPort := 0, 0
	parts := strings.Split(input, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.Contains(part, "-") {
			r := strings.SplitN(part, "-", 2)
			if len(r) != 2 {
				continue
			}
			start, end := parseIntPort(r[0]), parseIntPort(r[1])
			if start <= 0 || end <= 0 {
				continue
			}
			if end < start {
				start, end = end, start
			}
			if minPort == 0 || start < minPort {
				minPort = start
			}
			if maxPort == 0 || end > maxPort {
				maxPort = end
			}
			continue
		}
		p := parseIntPort(part)
		if p <= 0 {
			continue
		}
		if minPort == 0 || p < minPort {
			minPort = p
		}
		if maxPort == 0 || p > maxPort {
			maxPort = p
		}
	}
	return minPort, maxPort
}

func parseIntPort(s string) int {
	var p int
	fmt.Sscanf(strings.TrimSpace(s), "%d", &p)
	return p
}

func (r *Repository) ListTunnels() ([]map[string]interface{}, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	var tunnels []model.Tunnel
	if err := r.db.Order("inx ASC, id ASC").Find(&tunnels).Error; err != nil {
		return nil, err
	}

	tunnelMap := make(map[int64]map[string]interface{})
	orderedIDs := make([]int64, 0, len(tunnels))

	for _, t := range tunnels {
		tunnelMap[t.ID] = map[string]interface{}{
			"id": t.ID, "inx": t.Inx, "name": t.Name,
			"type": t.Type, "flow": t.Flow, "trafficRatio": t.TrafficRatio,
			"status": t.Status, "createdTime": t.CreatedTime,
			"inIp":            nullableString(t.InIP),
			"ipPreference":    t.IPPreference,
			"probeTargetHost": t.ProbeTargetHost,
			"probeTargetPort": t.ProbeTargetPort,
			"engine":          t.Engine,
			"inNodeId":        make([]map[string]interface{}, 0),
			"outNodeId":       make([]map[string]interface{}, 0),
			"chainNodes":      make([][]map[string]interface{}, 0),
		}
		orderedIDs = append(orderedIDs, t.ID)
	}

	// Build node IP map
	nodeIPMap := map[int64]string{}
	var nodeList []model.Node
	if err := r.db.Select("id, server_ip").Find(&nodeList).Error; err == nil {
		for _, n := range nodeList {
			nodeIPMap[n.ID] = n.ServerIP
		}
	}

	// Load chain tunnels
	var chains []model.ChainTunnel
	if err := r.db.Order("tunnel_id ASC, chain_type ASC, inx ASC, id ASC").Find(&chains).Error; err != nil {
		return nil, err
	}

	chainBucket := map[int64]map[int][]map[string]interface{}{}
	inNodeIPs := map[int64][]string{}

	for _, c := range chains {
		t, ok := tunnelMap[c.TunnelID]
		if !ok {
			continue
		}

		chainTypeInt := 0
		fmt.Sscanf(c.ChainType, "%d", &chainTypeInt)

		inx := int64(0)
		if c.Inx.Valid {
			inx = c.Inx.Int64
		}

		nodeObj := map[string]interface{}{
			"nodeId":    c.NodeID,
			"chainType": chainTypeInt,
			"inx":       inx,
		}
		if c.Protocol.Valid {
			nodeObj["protocol"] = c.Protocol.String
		}
		if c.Strategy.Valid {
			nodeObj["strategy"] = c.Strategy.String
		}
		if c.ConnectIP.Valid {
			nodeObj["connectIp"] = c.ConnectIP.String
		}

		switch chainTypeInt {
		case 1:
			t["inNodeId"] = append(t["inNodeId"].([]map[string]interface{}), nodeObj)
			if ip, ok := nodeIPMap[c.NodeID]; ok && ip != "" {
				inNodeIPs[c.TunnelID] = append(inNodeIPs[c.TunnelID], ip)
			}
		case 2:
			if _, ok := chainBucket[c.TunnelID]; !ok {
				chainBucket[c.TunnelID] = map[int][]map[string]interface{}{}
			}
			chainBucket[c.TunnelID][int(inx)] = append(chainBucket[c.TunnelID][int(inx)], nodeObj)
		case 3:
			t["outNodeId"] = append(t["outNodeId"].([]map[string]interface{}), nodeObj)
		}
	}

	for tunnelID, groups := range chainBucket {
		t := tunnelMap[tunnelID]
		if t == nil {
			continue
		}
		keys := make([]int, 0, len(groups))
		for k := range groups {
			keys = append(keys, k)
		}
		sort.Ints(keys)
		ordered := make([][]map[string]interface{}, 0, len(keys))
		for _, k := range keys {
			ordered = append(ordered, groups[k])
		}
		t["chainNodes"] = ordered

		if s, ok := t["inIp"].(string); !ok || strings.TrimSpace(s) == "" {
			if ips := inNodeIPs[tunnelID]; len(ips) > 0 {
				t["inIp"] = strings.Join(ips, ",")
			}
		}
	}

	result := make([]map[string]interface{}, 0, len(orderedIDs))
	for _, id := range orderedIDs {
		if t, ok := tunnelMap[id]; ok {
			result = append(result, t)
		}
	}
	return result, nil
}
