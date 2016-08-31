#!/usr/bin/perl

use JSON;
use Statistics::Descriptive;
use strict;

my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";

# We look for evidence of bad solar interference in source data and
# remove that source from that epoch if necessary.

# Begin by making a backup file.
my $catname = $od."/datarelease_catalogue.json";
my $bakname = $catname.".bak";

print "Creating backup catalogue file $bakname...\n";
print "cp $catname $bakname\n";
system "cp $catname $bakname";

print "Reading catalogue...\n";
my $json = JSON->new;
my $catalogue;
if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    die "Can't open file $catname\n";
}

my @epelems = ( "closurePhase", "declination", "defect", "epochs",
		"fluxDensity", "fluxDensityFit", "hourAngle", "mjd",
		"rightAscension", "arrayConfigurations", "solarAngles" );

foreach my $s (keys $catalogue) {
    print "Analysing source $s\n";
    # First, we make a list of all epochs where the solar angle is
    # greater than 60 degrees.
    my $solangs = $catalogue->{$s}->{'solarAngles'};
    my @indices;
    my @exclude_indices;
    for (my $i = 0; $i <= $#{$solangs}; $i++) {
	if ($solangs->[$i] >= 60) {
	    push @indices, $i;
	} else {
	    push @exclude_indices, $i;
	}
    }

    # Skip this source if it has no good epochs.
    if ($#indices == -1 || $#exclude_indices == -1) {
	next;
    }

    # We now take the median of the defects from those epochs.
    my @defects;
    for (my $i = 0; $i <= $#indices; $i++) {
	push @defects, $catalogue->{$s}->{'defect'}->[$indices[$i]];
    }
    my $stat = Statistics::Descriptive::Full->new();
    $stat->add_data(@defects);
    my $median_defect = $stat->median();
    print " MEDIAN DEFECT = ".$median_defect."\n";
    # Now for each of the other epochs, discard the data if the defect
    # is more than 5 times the median defect (plus 1 to exclude the
    # 5 * zero problem).
    my @remove_indices;
    for (my $i = 0; $i <= $#exclude_indices; $i++) {
	if ($catalogue->{$s}->{'defect'}->[$exclude_indices[$i]] >= (5 * $median_defect + 1)) {
	    push @remove_indices, $exclude_indices[$i];
	}
    }
    
    # And kill those indices.
    for (my $i = 0; $i <= $#remove_indices; $i++) {
	my $ri = $remove_indices[$i] - $i;
	print " removing epoch ".$catalogue->{$s}->{'epochs'}->[$ri]."...\n";
	for (my $j = 0; $j <= $#epelems; $j++) {
	    print "  removing $epelems[$j] value ".
		$catalogue->{$s}->{$epelems[$j]}->[$ri]."\n";
	    splice $catalogue->{$s}->{$epelems[$j]}, $ri, 1;
	}
    }
}

# Write the JSON out again.
print "Writing out the catalogue...\n";
open(C, ">".$catname);
print C to_json $catalogue;
close(C);

print "Solar interference removed.\n";
