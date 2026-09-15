"""Provenance / evidence graph.

Builds a directed graph over Evidence (and threat-alert) items using their
`derived_from` edges, then computes the set of INDEPENDENT ROOTS — evidence that
does not derive from any other evidence in the set. This is the core primitive for
the Epistemic Independence Scorer (WORKFLOW.md §17, SECURITY_MODEL.md §30-31):

    15 alerts that all cite one root  ->  raw_count=15, independent_roots=1

Repetition is NOT independence.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProvenanceNode:
    node_id: str
    source_id: str | None = None
    source_type: str | None = None
    trust_level: str | None = None


class EvidenceGraph:
    """Directed provenance graph: an edge A -> B means 'A is derived_from B'."""

    def __init__(self) -> None:
        self._nodes: dict[str, ProvenanceNode] = {}
        # derived_from[child] = set(parents it cites)
        self._derived_from: dict[str, set[str]] = {}

    def add_node(self, node: ProvenanceNode, derived_from: list[str] | None = None) -> None:
        self._nodes[node.node_id] = node
        self._derived_from.setdefault(node.node_id, set())
        for parent in derived_from or []:
            self._derived_from[node.node_id].add(parent)
            self._derived_from.setdefault(parent, set())  # ensure parent exists as node key

    @property
    def node_ids(self) -> list[str]:
        return list(self._nodes.keys())

    def raw_count(self) -> int:
        return len(self._nodes)

    def independent_roots(self) -> list[str]:
        """Roots = nodes that do not derive from any other node in the graph.

        A node whose every `derived_from` target is outside the known node set is
        still treated as a root (its cited source is unknown to us)."""
        roots: list[str] = []
        for node_id in self._nodes:
            parents = self._derived_from.get(node_id, set())
            # Only parents that are themselves present in the graph count as
            # 'derives from a known root'. If all parents are unknown/empty -> root.
            known_parents = {p for p in parents if p in self._nodes}
            if not known_parents:
                roots.append(node_id)
        return roots

    def independent_root_count(self) -> int:
        """Number of distinct independent evidence roots, collapsing shared roots.

        If several nodes all trace (transitively) to the same single root, they
        contribute one independent root, not many.
        """
        roots = set(self.independent_roots())
        if not roots:
            return 0

        # Map every node to the set of roots it transitively depends on.
        def resolve_roots(node_id: str, seen: set[str]) -> set[str]:
            if node_id in roots:
                return {node_id}
            if node_id in seen:
                return set()
            seen.add(node_id)
            result: set[str] = set()
            for parent in self._derived_from.get(node_id, set()):
                if parent in self._nodes:
                    result |= resolve_roots(parent, seen)
            return result or {node_id}

        reachable_roots: set[str] = set()
        for node_id in self._nodes:
            reachable_roots |= resolve_roots(node_id, set())
        return len(reachable_roots & roots) or len(roots)


def build_graph_from_evidence(evidence_items: list[dict]) -> EvidenceGraph:
    """Construct an EvidenceGraph from a list of Evidence-like dicts.

    Each item is expected to have: evidence_id, derived_from (list), and a
    source with source_id/source_type/trust_level.
    """
    graph = EvidenceGraph()
    for item in evidence_items:
        source = item.get("source", {}) if isinstance(item.get("source"), dict) else {}
        node = ProvenanceNode(
            node_id=item["evidence_id"],
            source_id=source.get("source_id"),
            source_type=source.get("source_type"),
            trust_level=source.get("trust_level"),
        )
        graph.add_node(node, derived_from=item.get("derived_from", []))
    return graph
