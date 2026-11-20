#[derive(Debug, Default)]
pub struct ShiftDrag {
    previous: Option<Sample>,
    origin: Option<(i32, i32)>,
    explorer: bool,
    fired: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Sample {
    pub left: bool,
    pub shift: bool,
    pub x: i32,
    pub y: i32,
    pub explorer: bool,
}

impl ShiftDrag {
    pub fn update(&mut self, sample: Sample) -> bool {
        let previous = self.previous.replace(sample).unwrap_or_default();
        if !sample.left {
            self.origin = None;
            self.fired = false;
            return false;
        }
        if !previous.left {
            self.origin = Some((sample.x, sample.y));
            self.explorer = sample.explorer;
            return false;
        }
        let moved = self
            .origin
            .is_some_and(|(x, y)| x.abs_diff(sample.x).max(y.abs_diff(sample.y)) >= 5);
        if self.explorer && moved && sample.shift && !previous.shift && !self.fired {
            self.fired = true;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn click(x: i32, shift: bool, explorer: bool) -> Sample {
        Sample {
            left: true,
            shift,
            x,
            y: 0,
            explorer,
        }
    }

    #[test]
    fn requires_a_new_shift_edge_after_moving_an_explorer_file() {
        let mut event = ShiftDrag::default();
        assert!(!event.update(click(0, true, true)));
        assert!(!event.update(click(20, true, true)));
        assert!(!event.update(click(20, false, false)));
        assert!(event.update(click(20, true, false)));
        assert!(!event.update(click(30, false, false)));
        assert!(!event.update(click(30, true, false)));
        assert!(!event.update(Sample::default()));
        assert!(!event.update(click(0, false, false)));
        assert!(!event.update(click(30, true, true)));
    }

    #[test]
    fn a_shift_tap_before_dragging_does_not_open_the_wheel() {
        let mut event = ShiftDrag::default();
        assert!(!event.update(click(0, false, true)));
        assert!(!event.update(click(1, true, true)));
        assert!(!event.update(click(12, true, true)));
        assert!(!event.update(click(12, false, true)));
        assert!(event.update(click(12, true, true)));
    }
}
